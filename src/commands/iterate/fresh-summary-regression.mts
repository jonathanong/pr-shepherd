import type { PollSummaryChecks } from "../../types.mts";
import { hasNoRelevantChecks } from "../../github/poll-summary-unreported.mts";
import type { RawSummaryPr } from "../../github/poll-summary-raw.mts";

/** Merge states that show the PR left the state its READY report saw. */
const LEFT_CLEAN_STATES = new Set(["UNSTABLE", "DIRTY", "BEHIND"]);

/**
 * Why the fresh read taken just before a READY is certified contradicts that READY report, or
 * `undefined` when it does not. Only evidence the next full check will also see counts: a
 * relevant check still running, a running Actions suite with no relevant check, or a merge
 * state that changed to `UNSTABLE`, `DIRTY` or `BEHIND`. Failing checks, unreported required
 * checks and a transient `UNKNOWN` are left to the next full check, and so is anything the
 * summary cannot confirm (an unavailable read, incomplete pages), so a summary that merely
 * disagrees with the one-PR check cannot hold a PR until the stall timeout.
 */
export function freshSummaryRegression(
  raw: RawSummaryPr,
  checks: PollSummaryChecks,
  reportMergeStateStatus: string,
): string | undefined {
  if ((checks.inProgress ?? 0) > 0) return "a relevant check is queued or in progress";
  if (checks.actionsWorkflowInProgress === true && hasNoRelevantChecks(checks)) {
    return "an Actions workflow suite is still running";
  }
  if (
    raw.mergeStateStatus !== reportMergeStateStatus &&
    LEFT_CLEAN_STATES.has(raw.mergeStateStatus)
  ) {
    return `the merge state changed to ${raw.mergeStateStatus}`;
  }
  return undefined;
}
