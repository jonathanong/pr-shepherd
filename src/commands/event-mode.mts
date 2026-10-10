import { loadConfig } from "../config/load.mts";
import { readStallState } from "../state/iterate-stall.mts";
import { runWithDurableState } from "../state/durable-state.mts";
import type {
  IterateCommandOptions,
  IterateResult,
  NextCheck,
  PollSummaryCommandOptions,
  PollSummaryResult,
} from "../types.mts";
import { eventAggregateStep, eventFixContinuation } from "./event-instructions.mts";
import {
  earliestNextCheck,
  MERGE_QUEUE_RECHECK_SECONDS,
  nextCheckCandidates,
  SAFETY_NET_SECONDS,
  type NextCheckCandidate,
} from "./next-check.mts";
import { isFixCodeContinuation } from "./iterate/check-instructions.mts";
import { runIterate } from "./iterate/index.mts";
import { resolvePollMode } from "./poll-mode.mts";
import { readStackStallDeadline } from "./stack-stall.mts";
import { runPoll, type PollCommandOptions } from "./poll.mts";
import {
  runAggregatePoll,
  runPollSummary,
  type AggregatePollCommandOptions,
} from "./poll-summary.mts";

function isEventMode(requested: IterateCommandOptions["pollMode"]): boolean {
  return resolvePollMode(requested, loadConfig().poll.mode) === "event";
}

/**
 * One iterate tick. In event mode the tick runs exactly once with no settle window and no
 * sleeping, persists seen markers immediately, and reports when to come back.
 */
export function runIterateForMode(opts: IterateCommandOptions): Promise<IterateResult> {
  if (!isEventMode(opts.pollMode)) return runIterate(opts);
  return runWithDurableState(() => runIterateEvent(opts));
}

/** One aggregate tick; event mode adds `pollMode` and `nextCheck`. */
export function runPollSummaryForMode(opts: PollSummaryCommandOptions): Promise<PollSummaryResult> {
  if (!isEventMode(opts.pollMode)) return runPollSummary(opts);
  const eventOpts = { ...opts, pollMode: "event" as const };
  return runWithDurableState(async () =>
    withAggregateNextCheck(await runPollSummary(eventOpts), eventOpts),
  );
}

/** The default poll command: the sleeping loop in poll mode, one tick in event mode. */
export function runPollForMode(opts: PollCommandOptions): Promise<IterateResult> {
  if (!isEventMode(opts.pollMode)) return runPoll(opts);
  const {
    intervalSeconds: _intervalSeconds,
    timeoutSeconds: _timeoutSeconds,
    debounceSeconds: _debounceSeconds,
    quietStatus: _quietStatus,
    untilTerminal: _untilTerminal,
    ...tick
  } = opts;
  return runIterateForMode(tick);
}

/** The aggregate poll command: the sleeping loop in poll mode, one tick in event mode. */
export function runAggregatePollForMode(
  opts: AggregatePollCommandOptions,
): Promise<PollSummaryResult> {
  return isEventMode(opts.pollMode) ? runPollSummaryForMode(opts) : runAggregatePoll(opts);
}

async function runIterateEvent(opts: IterateCommandOptions): Promise<IterateResult> {
  const { pollMode: _pollMode, ...iterateOpts } = opts;
  const result = await runIterate({ ...iterateOpts, persistSeen: true, fingerprintCache: false });
  const nowMs = Date.now();
  const stallDeadlineSeconds = await readStallDeadline(result, opts.stallTimeoutSeconds);
  const nextCheck = earliestNextCheck(
    nextCheckCandidates(
      {
        action: result.action,
        remainingSeconds: result.remainingSeconds,
        queued: result.mergeQueue?.inQueue === true,
        stackDraftHold: result.action === "wait" && result.stackDraftHold !== undefined,
        stallDeadlineSeconds,
      },
      nowMs,
    ),
    nowMs,
  );
  const tagged = { ...result, pollMode: "event" as const, ...(nextCheck && { nextCheck }) };
  if (tagged.action !== "fix_code" || !nextCheck) return tagged;
  return {
    ...tagged,
    fix: {
      ...tagged.fix,
      instructions: tagged.fix.instructions.map((step) =>
        isFixCodeContinuation(step) ? eventFixContinuation(nextCheck) : step,
      ),
    },
  };
}

/** When an unchanged state would trip the stall timeout, or undefined when no timer is running. */
async function readStallDeadline(
  result: IterateResult,
  stallTimeoutSeconds: number | undefined,
): Promise<number | undefined> {
  if (!["wait", "fix_code", "mark_ready"].includes(result.action)) return undefined;
  const timeout = stallTimeoutSeconds ?? loadConfig().iterate.stallTimeoutMinutes * 60;
  const [owner, repo] = result.repo.split("/");
  if (timeout <= 0 || !owner || !repo) return undefined;
  const read = await readStallState({ owner, repo, pr: result.pr });
  return read.ok && read.state ? read.state.firstSeenAt + timeout : undefined;
}

async function withAggregateNextCheck(
  result: PollSummaryResult,
  opts: PollSummaryCommandOptions,
): Promise<PollSummaryResult> {
  const tagged = { ...result, pollMode: "event" as const };
  const stallDeadlineSeconds = await readStackStallDeadline(
    result,
    opts.stallTimeoutSeconds ?? loadConfig().iterate.stallTimeoutMinutes * 60,
  );
  const nextCheck = aggregateNextCheck(result, stallDeadlineSeconds);
  if (!nextCheck) return tagged;
  const instructions = result.instructions ?? [];
  const waiting = result.reason === "waiting" || result.reason === "timeout";
  return {
    ...tagged,
    nextCheck,
    instructions: [
      ...instructions,
      `${instructions.length + 1}. ${eventAggregateStep(nextCheck, waiting)}`,
    ],
  };
}

function aggregateNextCheck(
  result: PollSummaryResult,
  stallDeadlineSeconds: number | undefined,
): NextCheck | undefined {
  if (
    result.reason === "all_terminal" ||
    result.nextAction === "cancel" ||
    result.nextAction === "escalate"
  ) {
    return undefined;
  }
  const candidates: NextCheckCandidate[] = result.prs
    .filter((item) => (item.remainingSeconds ?? 0) > 0)
    .map((item) => ({
      reason: "ready-delay" as const,
      seconds: item.remainingSeconds!,
      eventDriven: false,
    }));
  candidates.push(
    result.prs.some((item) => item.isInMergeQueue)
      ? { reason: "merge-queue", seconds: MERGE_QUEUE_RECHECK_SECONDS, eventDriven: false }
      : { reason: "safety-net", seconds: SAFETY_NET_SECONDS, eventDriven: true },
  );
  const nowMs = Date.now();
  if (stallDeadlineSeconds !== undefined) {
    candidates.push({
      reason: "stall-timeout",
      seconds: stallDeadlineSeconds - nowMs / 1000,
      eventDriven: false,
    });
  }
  return earliestNextCheck(candidates, nowMs);
}
