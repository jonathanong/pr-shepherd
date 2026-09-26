import { runIterate } from "./iterate/index.mts";
import type { IterateCommandOptions, IterateResult } from "../types.mts";
import { sleep } from "../util/sleep.mts";
import { withPollApiUsage } from "./poll-run.mts";
import { loadConfig } from "../config/load.mts";
import { quotaPollIntervalMs } from "./poll-quota.mts";
import { onePrCancelFromPulls, onePrRateLimitTargets } from "./poll-rate-limit-cancel.mts";
import { createUntilTerminalRateLimitRetry } from "./poll-rate-limit-wait.mts";
import { writeDebounceProgress, writeWaitProgress } from "./poll-progress.mts";

function noteRuleAutoResolve(result: IterateResult): void {
  if (result.ruleAutoResolve?.summary) process.stderr.write(`${result.ruleAutoResolve.summary}\n`);
}

export interface PollCommandOptions extends IterateCommandOptions {
  intervalSeconds: number;
  timeoutSeconds: number;
  /** Settle window after first FIX_CODE before returning. Default 60. 0 disables. */
  debounceSeconds?: number;
  quietStatus?: boolean;
  untilTerminal?: boolean;
}
const DEFAULT_POLL_DEBOUNCE_SECONDS = 60;
const MAX_TIMER_MS = 2 ** 31 - 1;
const TIMER_DRIFT_TOLERANCE_MS = 500;
/** @deprecated Hidden implementation for the legacy `poll` alias. */
export function runPoll(opts: PollCommandOptions): Promise<IterateResult> {
  return withPollApiUsage(
    () => runPollCore(opts),
    opts.untilTerminal === true,
    opts.intervalSeconds / 60,
  );
}
async function runPollCore(opts: PollCommandOptions): Promise<IterateResult> {
  const {
    intervalSeconds,
    timeoutSeconds,
    debounceSeconds: debounceSecondsOpt,
    quietStatus: quietStatusOpt,
    untilTerminal: untilTerminalOpt,
    ...iterateOpts
  } = opts;
  const intervalMs = Math.min(intervalSeconds * 1000, MAX_TIMER_MS);
  const timeoutMs = Math.min(timeoutSeconds * 1000, MAX_TIMER_MS);
  const debounceSeconds = debounceSecondsOpt ?? DEFAULT_POLL_DEBOUNCE_SECONDS;
  const debounceMs = Math.min(debounceSeconds * 1000, MAX_TIMER_MS);
  const quotaBands = loadConfig().watch.graphqlQuotaWarnings;
  const start = Date.now();
  let tick = 0;
  let lastResult: IterateResult | undefined;
  const verbose = opts.verbose === true;
  const quietStatus = quietStatusOpt === true;
  const untilTerminal = untilTerminalOpt === true;
  let lastWaitSignature: string | null = null;
  let pendingQuotaWarning: IterateResult["quotaWarning"];
  // Pin the PR resolved by the first tick; branch inference only matches OPEN PRs.
  let prNumber = opts.prNumber;
  let debounceUntil: number | null = null;
  const rateLimitRetry = createUntilTerminalRateLimitRetry();
  while (true) {
    tick += 1;
    const pastDebounce = debounceUntil !== null && Date.now() >= debounceUntil;
    const remainingBefore = untilTerminal
      ? Number.POSITIVE_INFINITY
      : timeoutMs - (Date.now() - start);
    // Cache only internal continuation ticks; returned ticks must fetch BatchPr.
    const allowCache =
      debounceUntil === null && remainingBefore + TIMER_DRIFT_TOLERANCE_MS >= intervalMs;
    const iterateTick = (fingerprintCache: boolean) =>
      runIterate({
        ...iterateOpts,
        prNumber,
        persistSeen: debounceSeconds === 0 || pastDebounce,
        fingerprintCache,
        deferQuotaWarning: !untilTerminal,
        quotaWarningMinimumPollIntervalMinutes: intervalSeconds / 60,
      });
    const runTick = async (fingerprintCache: boolean): Promise<IterateResult> => {
      while (true) {
        try {
          const result = await iterateTick(fingerprintCache);
          rateLimitRetry.reset();
          return result;
        } catch (err) {
          const early = await rateLimitRetry.wait(err, {
            untilTerminal,
            intervalMs,
            tickLabel: `poll tick ${tick}`,
            startedAt: start,
            targets: onePrRateLimitTargets(
              iterateOpts.targetRepository,
              prNumber,
              lastResult?.repo,
            ),
            onAllTerminal: (pulls) =>
              onePrCancelFromPulls(iterateOpts.targetRepository, lastResult?.repo, pulls),
          });
          if (early) return early;
        }
      }
    };
    lastResult = await runTick(allowCache);
    prNumber ??= lastResult.pr;
    if (lastResult.quotaWarning !== undefined) pendingQuotaWarning = lastResult.quotaWarning;
    const refreshIfReturning = async (): Promise<void> => {
      if (lastResult?.fingerprintReused !== true) return;
      lastResult = await runTick(false);
      if (lastResult.quotaWarning !== undefined) pendingQuotaWarning = lastResult.quotaWarning;
    };
    if (
      untilTerminal &&
      pendingQuotaWarning !== undefined &&
      !(lastResult.action === "fix_code" && debounceSeconds > 0 && !pastDebounce) &&
      !(debounceUntil !== null && !pastDebounce)
    ) {
      await refreshIfReturning();
      if (lastResult.action === "fix_code" && debounceSeconds > 0 && !pastDebounce) {
        debounceUntil ??= Date.now() + debounceMs;
        const remainingMs = Math.max(debounceUntil - Date.now(), 0);
        noteRuleAutoResolve(lastResult);
        writeDebounceProgress(tick, Date.now() - start, remainingMs);
        await sleep(Math.min(intervalMs, remainingMs));
        continue;
      }
      if (["cancel", "escalate"].includes(lastResult.action)) {
        const { quotaWarning: _quotaWarning, ...withoutQuotaWarning } = lastResult;
        lastResult = withoutQuotaWarning;
      } else if (lastResult.quotaWarning === undefined) {
        lastResult = { ...lastResult, quotaWarning: pendingQuotaWarning };
      }
      break;
    }
    if (lastResult.action === "wait" && !pastDebounce) {
      if (pendingQuotaWarning === undefined) debounceUntil = null;
      const elapsedMs = Date.now() - start;
      const sleepMs = quotaPollIntervalMs(
        quotaBands,
        lastResult.apiUsage,
        intervalMs,
        MAX_TIMER_MS,
      );
      if (!untilTerminal) {
        const remainingMs = timeoutMs - elapsedMs;
        if (remainingMs <= 0 || remainingMs + TIMER_DRIFT_TOLERANCE_MS < sleepMs) {
          await refreshIfReturning();
          break;
        }
      }
      lastWaitSignature = writeWaitProgress({
        tick,
        elapsedMs,
        sleepMs,
        result: lastResult,
        quietStatus,
        verbose,
        lastWaitSignature,
      });
      noteRuleAutoResolve(lastResult);
      await sleep(sleepMs);
      continue;
    }
    if (
      (untilTerminal || iterateOpts.merge) &&
      lastResult.action === "mark_ready" &&
      !pastDebounce
    ) {
      debounceUntil = null;
      const elapsedMs = Date.now() - start;
      const sleepMs = quotaPollIntervalMs(
        quotaBands,
        lastResult.apiUsage,
        intervalMs,
        MAX_TIMER_MS,
      );
      if (!untilTerminal) {
        const remainingMs = timeoutMs - elapsedMs;
        if (remainingMs <= 0 || remainingMs + TIMER_DRIFT_TOLERANCE_MS < sleepMs) {
          await refreshIfReturning();
          break;
        }
      }
      noteRuleAutoResolve(lastResult);
      await sleep(sleepMs);
      continue;
    }
    if (lastResult.action === "fix_code" && debounceSeconds > 0 && !pastDebounce) {
      noteRuleAutoResolve(lastResult);
      debounceUntil ??= Date.now() + debounceMs;
      const remainingMs = debounceUntil - Date.now();
      if (remainingMs > 0) {
        writeDebounceProgress(tick, Date.now() - start, remainingMs);
        await sleep(Math.min(intervalMs, remainingMs));
      }
      continue;
    }
    await refreshIfReturning();
    break;
  }
  return lastResult!;
}
