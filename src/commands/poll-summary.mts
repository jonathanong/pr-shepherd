import { loadConfig } from "../config/load.mts";
import { ShepherdError } from "../exit-codes.mts";
import { getRepoInfo } from "../github/client.mts";
import { withApiTelemetryScope, summarizeApiTelemetry } from "../github/api-telemetry.mts";
import { fetchPollSummary } from "../github/poll-summary.mts";
import { sleep } from "../util/sleep.mts";
import { graphqlQuotaPollIntervalMs, pollGraphQlRetryAfterMs } from "./poll-quota.mts";
import { evaluateWorktreeGraphqlQuotaWarning } from "../state/graphql-quota-warnings.mts";
import type { PollSummaryCommandOptions, PollSummaryResult } from "../types.mts";

const MAX_TIMER_MS = 2 ** 31 - 1;
const TIMER_DRIFT_TOLERANCE_MS = 500;

export interface AggregatePollCommandOptions extends PollSummaryCommandOptions {
  intervalSeconds: number;
  timeoutSeconds: number;
  debounceSeconds?: number;
  quietStatus?: boolean;
  untilTerminal?: boolean;
}

/** One read-only aggregate tick for API/MCP callers. */
export function runPollSummary(opts: PollSummaryCommandOptions): Promise<PollSummaryResult> {
  return withApiTelemetryScope(async () => attachUsage(await runPollSummaryCore(opts)));
}

/** CLI recurrence for explicit multi-PR and native-stack selectors. */
export function runAggregatePoll(opts: AggregatePollCommandOptions): Promise<PollSummaryResult> {
  return withApiTelemetryScope(() => runAggregatePollCore(opts));
}

async function runPollSummaryCore(opts: PollSummaryCommandOptions): Promise<PollSummaryResult> {
  const repo = opts.targetRepository ?? (await getRepoInfo());
  const fetched = await fetchPollSummary(opts, repo);
  const allTerminal = fetched.prs.every((item) => item.action === "cancel");
  const actionable = fetched.prs.some((item) => item.action !== "wait" && item.action !== "cancel");
  return {
    mode: "summary",
    repo: `${repo.owner}/${repo.name}`,
    selection: fetched.selection,
    reason: allTerminal ? "all_terminal" : actionable ? "actionable" : "waiting",
    prs: fetched.prs,
  };
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
  let rateLimitRetries = 0;
  let pendingQuotaWarning: PollSummaryResult["quotaWarning"];

  while (true) {
    tick += 1;
    try {
      last = await runPollSummaryCore(opts);
      rateLimitRetries = 0;
    } catch (error) {
      if (last?.selection.kind === "stack" && isMissingStack(error)) {
        const explicit = await runPollSummaryCore({
          ...opts,
          stackPrNumber: undefined,
          prNumbers: last.prs.map((item) => item.pr),
        });
        if (explicit.prs.every((item) => item.action === "cancel")) {
          return attachUsage({ ...explicit, reason: "all_terminal" });
        }
      }
      const retryMs = opts.untilTerminal ? pollGraphQlRetryAfterMs(error) : null;
      if (retryMs === null || rateLimitRetries >= 1) throw error;
      rateLimitRetries += 1;
      process.stderr.write(
        `[aggregate poll tick ${tick} / +${Math.round((Date.now() - start) / 1000)}s] GraphQL rate limit — retrying in ${Math.round(retryMs / 1000)}s\n`,
      );
      await sleep(retryMs);
      continue;
    }
    const allTerminal = last.prs.every((item) => item.action === "cancel");
    const immediate = last.prs.some((item) =>
      ["escalate", "merge", "mark_ready"].includes(item.action),
    );
    const hasFix = last.prs.some((item) => item.action === "fix_code");
    if (allTerminal) return attachUsage({ ...last, reason: "all_terminal" });
    const warning = await aggregateQuotaWarning(last, quotaBands, opts.intervalSeconds);
    if (warning) pendingQuotaWarning = warning;
    if (immediate) {
      return attachUsage({
        ...last,
        reason: "actionable",
        ...(pendingQuotaWarning && { quotaWarning: pendingQuotaWarning }),
      });
    }

    if (hasFix) {
      if (debounceMs === 0)
        return attachUsage({
          ...last,
          reason: "actionable",
          ...(pendingQuotaWarning && { quotaWarning: pendingQuotaWarning }),
        });
      debounceUntil ??= Date.now() + debounceMs;
      if (Date.now() >= debounceUntil)
        return attachUsage({
          ...last,
          reason: "actionable",
          ...(pendingQuotaWarning && { quotaWarning: pendingQuotaWarning }),
        });
    } else {
      debounceUntil = null;
      if (opts.untilTerminal && pendingQuotaWarning) {
        return attachUsage({ ...last, quotaWarning: pendingQuotaWarning });
      }
    }

    const elapsedMs = Date.now() - start;
    const sleepMs = debounceUntil
      ? Math.min(intervalMs, Math.max(debounceUntil - Date.now(), 0))
      : graphqlQuotaPollIntervalMs(
          quotaBands,
          summarizeApiTelemetry()?.graphql,
          intervalMs,
          MAX_TIMER_MS,
        );
    if (!opts.untilTerminal && debounceUntil === null) {
      const remainingMs = timeoutMs - elapsedMs;
      if (remainingMs <= 0 || remainingMs + TIMER_DRIFT_TOLERANCE_MS < sleepMs) {
        return attachUsage({ ...last, reason: "timeout" });
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

async function aggregateQuotaWarning(
  result: PollSummaryResult,
  bands: ReturnType<typeof loadConfig>["watch"]["graphqlQuotaWarnings"],
  intervalSeconds: number,
): Promise<PollSummaryResult["quotaWarning"]> {
  const usage = summarizeApiTelemetry()?.graphql;
  const [owner, repo] = result.repo.split("/");
  if (!usage || !owner || !repo) return undefined;
  return evaluateWorktreeGraphqlQuotaWarning(
    { owner, repo },
    bands.map((band) => ({
      ...band,
      pollIntervalMinutes: Math.max(band.pollIntervalMinutes, intervalSeconds / 60),
    })),
    usage,
    true,
  );
}

function summaryStatusSignature(result: PollSummaryResult): string {
  return JSON.stringify(
    result.prs.map((item) => ({
      pr: item.pr,
      action: item.action,
      state: item.state,
      mergeable: item.mergeable,
      mergeStateStatus: item.mergeStateStatus,
      reviewDecision: item.reviewDecision,
      checks: item.checks,
      review: item.review,
    })),
  );
}

function isMissingStack(error: unknown): boolean {
  return (
    error instanceof ShepherdError && error.message.includes("not part of a native GitHub stack")
  );
}

function attachUsage(result: PollSummaryResult): PollSummaryResult {
  const apiUsage = summarizeApiTelemetry();
  return apiUsage ? { ...result, apiUsage } : result;
}
