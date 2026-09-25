/* eslint-disable max-lines */
import { loadConfig } from "../config/load.mts";
import { ShepherdError } from "../exit-codes.mts";
import { getRepoInfo } from "../github/client.mts";
import { withApiTelemetryScope, summarizeApiTelemetry } from "../github/api-telemetry.mts";
import { fetchPollSummary } from "../github/poll-summary.mts";
import { sleep } from "../util/sleep.mts";
import { aggregateQuotaWarning, quotaPollIntervalMs } from "./poll-quota.mts";
import { aggregateCancelFromPulls, aggregateRateLimitTargets } from "./poll-rate-limit-cancel.mts";
import { createUntilTerminalRateLimitRetry } from "./poll-rate-limit-wait.mts";
import type { PollSummaryCommandOptions, PollSummaryResult } from "../types.mts";
import { planPollSummary, withPollSummaryInstructions } from "./poll-summary-instructions.mts";
import { summaryStatusSignature } from "./poll-summary-signature.mts";
import { applyStackStallGuard } from "./stack-stall.mts";

const MAX_TIMER_MS = 2 ** 31 - 1;
const TIMER_DRIFT_TOLERANCE_MS = 500;
export interface AggregatePollCommandOptions extends PollSummaryCommandOptions {
  intervalSeconds: number;
  timeoutSeconds: number;
  debounceSeconds?: number;
  quietStatus?: boolean;
  untilTerminal?: boolean;
}
export function runPollSummary(opts: PollSummaryCommandOptions): Promise<PollSummaryResult> {
  return withApiTelemetryScope(async () => attachUsage(await runPollSummaryCore(opts), opts.merge));
}

export function runAggregatePoll(opts: AggregatePollCommandOptions): Promise<PollSummaryResult> {
  return withApiTelemetryScope(() => runAggregatePollCore(opts));
}

async function runPollSummaryCore(opts: PollSummaryCommandOptions): Promise<PollSummaryResult> {
  const repo = opts.targetRepository ?? (await getRepoInfo());
  const fetched = await fetchPollSummary(opts, repo);
  const allTerminal = fetched.prs.every((item) => item.action === "cancel");
  const actionable = fetched.prs.some((item) => item.action !== "wait" && item.action !== "cancel");
  const planned = planPollSummary(
    {
      mode: "summary",
      repo: `${repo.owner}/${repo.name}`,
      selection: fetched.selection,
      reason: allTerminal ? "all_terminal" : actionable ? "actionable" : "waiting",
      prs: fetched.prs,
      ...(fetched.stackAncestry?.length && { stackAncestry: fetched.stackAncestry }),
    },
    opts.merge === true,
  );
  return applyStackStallGuard(
    planned,
    repo,
    opts.stallTimeoutSeconds ?? loadConfig().iterate.stallTimeoutMinutes * 60,
  );
}

async function runAggregatePollCore(opts: AggregatePollCommandOptions): Promise<PollSummaryResult> {
  const intervalMs = Math.min(opts.intervalSeconds * 1000, MAX_TIMER_MS);
  const timeoutMs = Math.min(opts.timeoutSeconds * 1000, MAX_TIMER_MS);
  const debounceMs = Math.min((opts.debounceSeconds ?? 60) * 1000, MAX_TIMER_MS);
  const quotaBands = loadConfig().watch.graphqlQuotaWarnings;
  const start = Date.now();
  let tick = 0;
  let debounceUntil: number | null = null;
  let last: PollSummaryResult | undefined;
  let lastStatusSignature: string | null = null;
  const rateLimitRetry = createUntilTerminalRateLimitRetry();
  let pendingQuotaWarning: PollSummaryResult["quotaWarning"];

  while (true) {
    tick += 1;
    try {
      last = await runPollSummaryCore(opts);
      rateLimitRetry.reset();
    } catch (error) {
      if (last?.selection.kind === "stack" && isMissingStack(error)) {
        const explicit = await runPollSummaryCore({
          ...opts,
          stackPrNumber: undefined,
          prNumbers: last.prs.map((item) => item.pr),
        });
        if (explicit.prs.every((item) => item.state === "MERGED")) {
          const warning = await aggregateQuotaWarning(explicit, quotaBands, opts.intervalSeconds);
          if (warning) pendingQuotaWarning = warning;
          return attachUsage(
            {
              ...explicit,
              selection: last.selection,
              reason: "all_terminal",
              nextAction: "cancel",
              stackMergeable: true,
              instructions: ["1. Stop — every stack layer is merged."],
              ...(pendingQuotaWarning && { quotaWarning: pendingQuotaWarning }),
            },
            opts.merge,
          );
        }
        return attachUsage(
          {
            ...explicit,
            selection: last.selection,
            reason: "actionable",
            nextAction: "escalate",
            stackMergeable: false,
            instructions: [
              `1. Native stack #${last.selection.stackNumber} disappeared before every tracked layer merged. Stop and ask the stack owner to reconcile the remaining PRs; do not claim the stack is complete.`,
            ],
            ...(pendingQuotaWarning && { quotaWarning: pendingQuotaWarning }),
          },
          opts.merge,
        );
      }
      const early = await rateLimitRetry.wait(error, {
        untilTerminal: opts.untilTerminal === true,
        intervalMs,
        tickLabel: `aggregate poll tick ${tick}`,
        startedAt: start,
        targets: aggregateRateLimitTargets(last, opts.targetRepository, opts.prNumbers),
        onAllTerminal: (pulls) => aggregateCancelFromPulls(last, opts.targetRepository, pulls),
      });
      if (early) {
        return presentProbedCancel(
          pendingQuotaWarning ? { ...early, quotaWarning: pendingQuotaWarning } : early,
          opts.merge,
        );
      }
      continue;
    }
    const allTerminal =
      last.selection.kind === "stack"
        ? last.nextAction === "cancel"
        : last.prs.every((item) => item.action === "cancel");
    const immediate =
      last.selection.kind === "stack"
        ? (last.nextAction === "escalate" || last.nextAction === "merge") &&
          last.reason !== "waiting"
        : last.prs.some((item) => ["escalate", "merge", "mark_ready"].includes(item.action));
    const hasFix =
      last.selection.kind === "stack"
        ? last.nextAction === "shepherd" && last.reason !== "waiting"
        : last.prs.some((item) => item.action === "fix_code");
    const warning = await aggregateQuotaWarning(last, quotaBands, opts.intervalSeconds);
    if (warning) pendingQuotaWarning = warning;
    if (allTerminal) {
      return attachUsage(
        {
          ...last,
          reason: "all_terminal",
          ...(pendingQuotaWarning && { quotaWarning: pendingQuotaWarning }),
        },
        opts.merge,
      );
    }
    if (immediate) {
      return attachUsage(
        {
          ...last,
          reason: "actionable",
          ...(pendingQuotaWarning && { quotaWarning: pendingQuotaWarning }),
        },
        opts.merge,
      );
    }

    if (hasFix) {
      if (debounceMs === 0)
        return attachUsage(
          {
            ...last,
            reason: "actionable",
            ...(pendingQuotaWarning && { quotaWarning: pendingQuotaWarning }),
          },
          opts.merge,
        );
      debounceUntil ??= Date.now() + debounceMs;
      if (Date.now() >= debounceUntil)
        return attachUsage(
          {
            ...last,
            reason: "actionable",
            ...(pendingQuotaWarning && { quotaWarning: pendingQuotaWarning }),
          },
          opts.merge,
        );
    } else {
      debounceUntil = null;
      if (opts.untilTerminal && pendingQuotaWarning) {
        return attachUsage({ ...last, quotaWarning: pendingQuotaWarning }, opts.merge);
      }
    }

    const elapsedMs = Date.now() - start;
    const sleepMs = debounceUntil
      ? Math.min(intervalMs, Math.max(debounceUntil - Date.now(), 0))
      : quotaPollIntervalMs(quotaBands, summarizeApiTelemetry(), intervalMs, MAX_TIMER_MS);
    if (!opts.untilTerminal && debounceUntil === null) {
      const remainingMs = timeoutMs - elapsedMs;
      if (remainingMs <= 0 || remainingMs + TIMER_DRIFT_TOLERANCE_MS < sleepMs) {
        return attachUsage({ ...last, reason: "timeout" }, opts.merge);
      }
    }
    const statusSignature = summaryStatusSignature(last);
    if (!opts.quietStatus || hasFix || statusSignature !== lastStatusSignature) {
      process.stderr.write(
        `[aggregate poll tick ${tick} / +${Math.round(elapsedMs / 1000)}s] ${last.prs
          .map((item) => `#${item.pr} ${item.action.toUpperCase()}`)
          .join(", ")}\n`,
      );
    }
    lastStatusSignature = statusSignature;
    await sleep(sleepMs);
  }
}

function presentProbedCancel(
  result: PollSummaryResult,
  merge: boolean | undefined,
): PollSummaryResult {
  const planned = attachUsage({ ...result, reason: "all_terminal" }, merge);
  if (planned.selection.kind !== "stack" || planned.nextAction === "cancel") return planned;
  return {
    ...planned,
    prs: result.prs,
    reason: "all_terminal",
    nextAction: "cancel",
    stackMergeable: true,
    instructions: ["1. Stop — every stack layer is terminal."],
  };
}

function isMissingStack(error: unknown): boolean {
  return (
    error instanceof ShepherdError && error.message.includes("not part of a native GitHub stack")
  );
}

function attachUsage(result: PollSummaryResult, mergeRequested?: boolean): PollSummaryResult {
  const apiUsage = summarizeApiTelemetry();
  const enriched = apiUsage ? { ...result, apiUsage } : result;
  // A disappeared native stack is an aggregate-level terminal handoff. Keep
  // that explicit escalation intact even when the one-PR fallback contains
  // open orphan rows that would otherwise be re-planned as fix_code.
  if (enriched.selection.kind === "stack" && enriched.nextAction === "escalate") {
    return enriched;
  }
  return withPollSummaryInstructions(enriched, mergeRequested === true);
}
