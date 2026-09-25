import { GitHubRequestError } from "../github/errors.mts";
import { rest } from "../github/rest-http.mts";
import type { MergeStateStatus } from "../types.mts";
import { sleep } from "../util/sleep.mts";
import type { RateLimitProbePull, RateLimitPullTarget } from "./poll-rate-limit-cancel.mts";
import {
  formatRateLimitGiveUpLine,
  formatRateLimitRetryLine,
  pollRateLimitRetryAfterMs,
} from "./poll-quota.mts";

const MAX_NO_PROGRESS_ATTEMPTS = 5;
const NO_PROGRESS_BACKOFF_MS = [15_000, 30_000, 60_000];
const MERGE_STATES = new Set([
  "BEHIND",
  "BLOCKED",
  "CLEAN",
  "DIRTY",
  "DRAFT",
  "HAS_HOOKS",
  "UNKNOWN",
  "UNSTABLE",
]);

interface WaitOptions<T> {
  untilTerminal: boolean;
  intervalMs: number;
  tickLabel: string;
  startedAt: number;
  targets: RateLimitPullTarget[];
  onAllTerminal?: (pulls: RateLimitProbePull[]) => T | undefined;
}

interface RetryState {
  armed: boolean;
  noProgress: number;
  lastResetAt?: number;
}

export function createUntilTerminalRateLimitRetry() {
  const state: RetryState = { armed: false, noProgress: 0 };
  return {
    reset(): void {
      state.armed = false;
      state.noProgress = 0;
      state.lastResetAt = undefined;
    },
    wait<T>(err: unknown, opts: WaitOptions<T>): Promise<T | undefined> {
      return waitForRateLimit(state, err, opts);
    },
  };
}

function backoffMs(attempt: number): number {
  return NO_PROGRESS_BACKOFF_MS[Math.min(attempt, NO_PROGRESS_BACKOFF_MS.length) - 1] ?? 60_000;
}

async function waitForRateLimit<T>(
  state: RetryState,
  err: unknown,
  opts: WaitOptions<T>,
): Promise<T | undefined> {
  const retry = opts.untilTerminal ? pollRateLimitRetryAfterMs(err) : null;
  if (!retry) throw err;
  const elapsed = Math.round((Date.now() - opts.startedAt) / 1000);
  const progressed =
    state.armed &&
    retry.resetAt !== undefined &&
    (state.lastResetAt === undefined || retry.resetAt > state.lastResetAt);
  let sleepMs = retry.ms;
  if (!state.armed || progressed) {
    state.armed = true;
    state.noProgress = 0;
    if (retry.resetAt !== undefined) state.lastResetAt = retry.resetAt;
  } else {
    state.noProgress += 1;
    if (state.noProgress >= MAX_NO_PROGRESS_ATTEMPTS) {
      process.stderr.write(formatRateLimitGiveUpLine(opts.tickLabel, elapsed, retry));
      throw err;
    }
    sleepMs = backoffMs(state.noProgress);
  }
  process.stderr.write(
    formatRateLimitRetryLine(opts.tickLabel, elapsed, { ...retry, ms: sleepMs }),
  );
  return sleepRateLimit(sleepMs, opts, retry.resource);
}

async function sleepRateLimit<T>(
  ms: number,
  opts: WaitOptions<T>,
  resource: string,
): Promise<T | undefined> {
  const canProbe = resource !== "core" && opts.targets.length > 0;
  if (ms <= opts.intervalMs || opts.intervalMs <= 0) {
    await sleep(ms);
    return undefined;
  }
  let remaining = ms;
  let probesDisabled = !canProbe;
  while (remaining > 0) {
    const chunk = Math.min(opts.intervalMs, remaining);
    await sleep(chunk);
    remaining -= chunk;
    if (remaining <= 0 || probesDisabled) continue;
    try {
      const found = await probeOpenPulls(opts.targets, opts.onAllTerminal);
      if (found !== undefined) return found;
    } catch (error) {
      if (!isRestCoreRateLimit(error)) throw error;
      probesDisabled = true;
    }
  }
  return undefined;
}

function isRestCoreRateLimit(error: unknown): boolean {
  return (
    error instanceof GitHubRequestError &&
    error.rateLimit?.resource === "core" &&
    error.rateLimit.remaining <= 0
  );
}

interface GithubPullResponse {
  merged?: boolean;
  merged_at?: string | null;
  state?: string;
  title?: string;
  html_url?: string;
  draft?: boolean;
  mergeable?: boolean | null;
  mergeable_state?: string;
  head?: { ref?: string; sha?: string };
  base?: { ref?: string };
}

async function probeOpenPulls<T>(
  targets: RateLimitPullTarget[],
  onAllTerminal: WaitOptions<T>["onAllTerminal"],
): Promise<T | undefined> {
  const pulls: RateLimitProbePull[] = [];
  for (const target of targets) {
    // GraphQL is exhausted for this sleep. REST core is a separate budget, so
    // GET /repos/{owner}/{repo}/pulls/{n} can still see a merge or close.
    const data = await rest<GithubPullResponse>(
      "GET",
      `/repos/${target.owner}/${target.repo}/pulls/${target.pr}`,
    );
    const state = terminalState(data);
    if (!state) return undefined;
    pulls.push(toProbePull(target.pr, state, data));
  }
  return onAllTerminal?.(pulls);
}

function terminalState(pull: GithubPullResponse | undefined): "MERGED" | "CLOSED" | undefined {
  if (!pull) return undefined;
  if (pull.merged === true || pull.merged_at != null) return "MERGED";
  if (pull.state?.toLowerCase() === "closed") return "CLOSED";
  return undefined;
}

function toProbePull(
  pr: number,
  state: "MERGED" | "CLOSED",
  pull: GithubPullResponse,
): RateLimitProbePull {
  const mergeState = pull.mergeable_state?.toUpperCase();
  return {
    pr,
    state,
    title: pull.title ?? "",
    url: pull.html_url ?? "",
    draft: pull.draft === true,
    mergeable:
      pull.mergeable === true ? "MERGEABLE" : pull.mergeable === false ? "CONFLICTING" : "UNKNOWN",
    mergeStateStatus: MERGE_STATES.has(mergeState ?? "")
      ? (mergeState as MergeStateStatus)
      : "UNKNOWN",
    baseRefName: pull.base?.ref ?? "",
    headRefName: pull.head?.ref ?? "",
    headRefOid: pull.head?.sha ?? "",
  };
}
