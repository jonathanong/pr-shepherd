import { runIterate } from "./iterate/index.mts";
import { pollTickSeenOptions } from "./poll-seen-options.mts";
import { markEditedCommentsSeen } from "./iterate/edited-comment-markers.mts";
import type { IterateResult } from "../types.mts";
import type { PollCommandOptions } from "./poll-options.mts";
import { sleep } from "../util/sleep.mts";
import { withPollApiUsage } from "./poll-run.mts";
import { loadConfig } from "../config/load.mts";
import { carryQuotaWarning, onePrSleepMs } from "./poll-quota.mts";
import { onePrCancelFromPulls, onePrRateLimitTargets } from "./poll-rate-limit-cancel.mts";
import { createUntilTerminalRateLimitRetry } from "./poll-rate-limit-wait.mts";
import { createTickRunner } from "./poll-tick.mts";
import {
  writeDebounceProgress,
  writeRuleAutoResolveProgress,
  writeWaitProgress,
} from "./poll-progress.mts";
import { onePrDeadline } from "./stall-deadline.mts";
import {
  onePrTargets,
  pauseBeforeNextTick,
  withPollEvents,
  type PollEvents,
} from "./poll-events.mts";

export type { PollCommandOptions } from "./poll-options.mts";
const DEFAULT_POLL_DEBOUNCE_SECONDS = 60;
const MAX_TIMER_MS = 2 ** 31 - 1;
const TIMER_DRIFT_TOLERANCE_MS = 500;
type Announce = (sleepMs: number, viaEvents: boolean) => void;
export function runPoll(opts: PollCommandOptions): Promise<IterateResult> {
  return withPollEvents(opts.verbose === true, (events) =>
    withPollApiUsage(
      () => runPollCore(opts, events),
      opts.untilTerminal === true,
      opts.intervalSeconds / 60,
    ),
  );
}
async function runPollCore(
  opts: PollCommandOptions,
  events: PollEvents | undefined,
): Promise<IterateResult> {
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
  const quotaBands = loadConfig().quotaWarningBands;
  const start = Date.now();
  let tick = 0;
  let lastResult: IterateResult | undefined;
  const verbose = opts.verbose === true;
  const quietStatus = quietStatusOpt === true;
  const untilTerminal = untilTerminalOpt === true;
  const swallowsMarkReady = untilTerminal || iterateOpts.merge === true;
  let lastWaitSignature: string | null = null;
  let pendingQuotaWarning: IterateResult["quotaWarning"];
  let prNumber = opts.prNumber;
  let debounceUntil: number | null = null;
  const rateLimitRetry = createUntilTerminalRateLimitRetry();
  const head: { headSha?: string; headRef?: string; ciStartDeadlineSeconds?: number } = {};
  while (true) {
    tick += 1;
    const tickStartedAt = Date.now();
    const pastDebounce = debounceUntil !== null && Date.now() >= debounceUntil;
    const seenOptions = pollTickSeenOptions(debounceSeconds, pastDebounce);
    const remainingBefore = untilTerminal
      ? Number.POSITIVE_INFINITY
      : timeoutMs - (Date.now() - start);
    const allowCache =
      debounceUntil === null && remainingBefore + TIMER_DRIFT_TOLERANCE_MS >= intervalMs;
    const runTick = createTickRunner({
      run: (fingerprintCache) =>
        runIterate({
          ...iterateOpts,
          prNumber,
          ...seenOptions,
          ...(events && { eventTargetSink: head, stallDeadlineSink: head }),
          fingerprintCache,
          deferQuotaWarning: !untilTerminal,
          quotaWarningMinimumPollIntervalMinutes: intervalSeconds / 60,
        }),
      retry: rateLimitRetry,
      untilTerminal,
      intervalMs,
      tickLabel: `poll tick ${tick}`,
      startedAt: start,
      targets: () =>
        onePrRateLimitTargets(iterateOpts.targetRepository, prNumber, lastResult?.repo),
      onAllTerminal: (pulls) =>
        onePrCancelFromPulls(iterateOpts.targetRepository, lastResult?.repo, pulls),
    });
    lastResult = await runTick(allowCache);
    prNumber ??= lastResult.pr;
    pendingQuotaWarning = carryQuotaWarning(pendingQuotaWarning, lastResult.quotaWarning);
    const refreshIfReturning = async (): Promise<void> => {
      if (lastResult?.fingerprintReused !== true) return;
      lastResult = await runTick(false);
      pendingQuotaWarning = carryQuotaWarning(pendingQuotaWarning, lastResult.quotaWarning);
    };
    /** Wait for the next tick; true when the poll window ends first and the poll should stop. */
    const pause = async (result: IterateResult, announce: Announce) => {
      const deadline = events && (await onePrDeadline(result, iterateOpts, head));
      const sleepMs = onePrSleepMs(quotaBands, result.apiUsage, intervalMs, MAX_TIMER_MS);
      return pauseBeforeNextTick({
        events,
        targets: onePrTargets(result, head),
        recheck: result.mergeStateStatus === "UNKNOWN",
        sleepMs,
        intervalMs,
        label: `poll tick ${tick} / +${Math.round((Date.now() - start) / 1000)}s`,
        tickStartedAt,
        ...deadline,
        remainingMs: untilTerminal ? Infinity : timeoutMs - (Date.now() - start),
        announce: (viaEvents) => announce(sleepMs, viaEvents),
      });
    };
    if (
      untilTerminal &&
      pendingQuotaWarning !== undefined &&
      !(lastResult.action === "triage" && debounceSeconds > 0 && !pastDebounce) &&
      !(debounceUntil !== null && !pastDebounce)
    ) {
      await refreshIfReturning();
      if (lastResult.action === "triage" && debounceSeconds > 0 && !pastDebounce) {
        debounceUntil ??= Date.now() + debounceMs;
        const remainingMs = Math.max(debounceUntil - Date.now(), 0);
        writeRuleAutoResolveProgress(lastResult);
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
      const waiting = lastResult;
      const stop = await pause(waiting, (sleepMs, viaEvents) => {
        lastWaitSignature = writeWaitProgress({
          tick,
          elapsedMs,
          sleepMs,
          viaEvents,
          result: waiting,
          quietStatus,
          verbose,
          lastWaitSignature,
        });
        writeRuleAutoResolveProgress(waiting);
      });
      if (stop) {
        await refreshIfReturning();
        break;
      }
      continue;
    }
    if (swallowsMarkReady && lastResult.action === "mark_ready" && !pastDebounce) {
      debounceUntil = null;
      const ready = lastResult;
      const stop = await pause(ready, () => writeRuleAutoResolveProgress(ready));
      if (stop) {
        await refreshIfReturning();
        break;
      }
      continue;
    }
    if (lastResult.action === "triage" && debounceSeconds > 0 && !pastDebounce) {
      writeRuleAutoResolveProgress(lastResult);
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
  return markEditedCommentsSeen(lastResult!);
}
