import { loadConfig } from "../config/load.mts";
import { readStallState } from "../state/iterate-stall.mts";
import type {
  IterateCommandOptions,
  IterateResult,
  NextCheck,
  PollSummaryCommandOptions,
  PollSummaryResult,
} from "../types.mts";
import { tickAggregateStep } from "./tick-instructions.mts";
import {
  earliestNextCheck,
  MERGE_QUEUE_RECHECK_SECONDS,
  nextCheckCandidates,
  SAFETY_NET_SECONDS,
  type NextCheckCandidate,
} from "./next-check.mts";
import {
  isHandedOffSelection,
  onlyDraftVerificationSelection,
} from "./poll-summary-explicit-instructions.mts";
import { runIterate } from "./iterate/index.mts";
import { runsSingleTick } from "./single-tick.mts";
import { readStackStallDeadline } from "./stack-stall.mts";
import { runPoll, type PollCommandOptions } from "./poll.mts";
import {
  runAggregatePoll,
  runPollSummary,
  type AggregatePollCommandOptions,
} from "./poll-summary.mts";

/**
 * One iterate tick: no settle window and no sleeping, seen markers persist immediately, and
 * `nextCheck` reports when to come back if no GitHub event arrives first. The tick's result is
 * never discarded, so edited-comment markers are written on the result it returns.
 */
export async function runIterateTick(opts: IterateCommandOptions): Promise<IterateResult> {
  const sink: { ciStartDeadlineSeconds?: number } = {};
  const result = await runIterate({
    ...opts,
    persistSeen: true,
    deferEditedCommentMarkers: false,
    fingerprintCache: false,
    stallDeadlineSink: sink,
  });
  // `[FIX_CODE]` already reruns at once, and that rerun reports its own `nextCheck`.
  if (result.action === "fix_code") return result;
  const nowMs = Date.now();
  const stallDeadlineSeconds = earliestDeadline(
    await readStallDeadline(result, opts.stallTimeoutSeconds),
    result.action === "wait" ? sink.ciStartDeadlineSeconds : undefined,
  );
  const nextCheck = earliestNextCheck(
    nextCheckCandidates(
      {
        action: result.action,
        remainingSeconds: result.remainingSeconds,
        queued: result.mergeQueue?.inQueue === true,
        restMerge: result.action === "merge" && result.merge.mode === "rest",
        stallDeadlineSeconds,
      },
      nowMs,
    ),
    nowMs,
    quotaFloorSeconds(result.quotaWarning),
  );
  return nextCheck ? { ...result, nextCheck } : result;
}

/** One aggregate tick, with `nextCheck` unless nothing remains to wait for. */
export async function runPollSummaryTick(
  opts: PollSummaryCommandOptions,
): Promise<PollSummaryResult> {
  return withAggregateNextCheck(await runPollSummary({ ...opts, tick: true }), opts);
}

/** The default command: the sleeping loop, or one tick in a cloud session. */
export function runPollCommand(opts: PollCommandOptions): Promise<IterateResult> {
  if (!runsSingleTick()) return runPoll(opts);
  const {
    intervalSeconds: _intervalSeconds,
    timeoutSeconds: _timeoutSeconds,
    debounceSeconds: _debounceSeconds,
    quietStatus: _quietStatus,
    untilTerminal: _untilTerminal,
    ...tick
  } = opts;
  return runIterateTick(tick);
}

/** The aggregate loop (`stack`, several PRs), or one tick in a cloud session. */
export function runAggregatePollCommand(
  opts: AggregatePollCommandOptions,
): Promise<PollSummaryResult> {
  return runsSingleTick() ? runPollSummaryTick(opts) : runAggregatePoll(opts);
}

function earliestDeadline(...deadlines: (number | undefined)[]): number | undefined {
  const known = deadlines.filter((d): d is number => d !== undefined);
  return known.length > 0 ? Math.min(...known) : undefined;
}

/** When an unchanged state would trip the stall timeout, or undefined when no timer is running. */
async function readStallDeadline(
  result: IterateResult,
  stallTimeoutSeconds: number | undefined,
): Promise<number | undefined> {
  if (result.action !== "wait") return undefined;
  const timeout = stallTimeoutSeconds ?? loadConfig().iterate["stall-timeout-minutes"] * 60;
  const [owner, repo] = result.repo.split("/");
  if (timeout <= 0 || !owner || !repo) return undefined;
  const read = await readStallState({ owner, repo, pr: result.pr });
  return read.ok && read.state ? read.state.firstSeenAt + timeout : undefined;
}

async function withAggregateNextCheck(
  result: PollSummaryResult,
  opts: PollSummaryCommandOptions,
): Promise<PollSummaryResult> {
  const stallDeadlineSeconds = await readStackStallDeadline(
    result,
    opts.stallTimeoutSeconds ?? loadConfig().iterate["stall-timeout-minutes"] * 60,
  );
  const nextCheck = aggregateNextCheck(result, stallDeadlineSeconds);
  if (!nextCheck) return result;
  const instructions = (result.instructions ?? []).map(withoutPollingCadence);
  const waiting = result.reason === "waiting" || result.reason === "timeout";
  return {
    ...result,
    nextCheck,
    instructions: [
      ...instructions,
      `${instructions.length + 1}. ${tickAggregateStep(nextCheck, waiting)}`,
    ],
  };
}

/** The appended tick step owns timing, including pending stack merges. */
function withoutPollingCadence(step: string): string {
  return step
    .replace(/ Recheck(?: them)? at the configured polling cadence\./g, "")
    .replace(
      "rerun that command at the configured cadence to resume its UUID",
      "rerun that command after the wake-up below to resume its UUID",
    );
}

function aggregateNextCheck(
  result: PollSummaryResult,
  stallDeadlineSeconds: number | undefined,
): NextCheck | undefined {
  if (
    isHandedOffSelection(result) ||
    (onlyDraftVerificationSelection(result) && result.nextAction !== "merge") ||
    result.reason === "all_terminal" ||
    result.nextAction === "cancel" ||
    result.nextAction === "escalate"
  ) {
    return undefined;
  }
  const candidates: NextCheckCandidate[] = result.prs
    .filter((item) => (item.remainingSeconds ?? 0) > 0)
    .map((item) => ({ reason: "ready-delay" as const, seconds: item.remainingSeconds! }));
  // A printed stack merge can stay pending, so recheck it like a REST merge. A mergeable
  // stack that is queued or waiting prints no merge command, so it gets no such wake-up.
  if (result.nextAction === "merge") {
    candidates.push({ reason: "merge-pending", seconds: MERGE_QUEUE_RECHECK_SECONDS });
  }
  candidates.push(
    result.prs.some((item) => item.isInMergeQueue)
      ? { reason: "merge-queue", seconds: MERGE_QUEUE_RECHECK_SECONDS }
      : { reason: "safety-net", seconds: SAFETY_NET_SECONDS },
  );
  const nowMs = Date.now();
  if (stallDeadlineSeconds !== undefined) {
    candidates.push({ reason: "stall-timeout", seconds: stallDeadlineSeconds - nowMs / 1000 });
  }
  return earliestNextCheck(candidates, nowMs, quotaFloorSeconds(result.quotaWarning));
}

function quotaFloorSeconds(warning: { pollIntervalMinutes: number } | undefined): number {
  return warning === undefined ? 0 : warning.pollIntervalMinutes * 60;
}
