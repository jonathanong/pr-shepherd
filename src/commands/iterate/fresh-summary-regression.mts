import type { PollSummaryChecks } from "../../types.mts";
import { hasNoRelevantChecks } from "../../github/poll-summary-unreported.mts";
import type { RawSummaryPr } from "../../github/poll-summary-raw.mts";

/** Merge states that show the PR left the state its READY report saw. */
const LEFT_CLEAN_STATES = new Set(["UNSTABLE", "DIRTY", "BEHIND", "UNKNOWN"]);

/**
 * Why the fresh read taken just before a READY is certified contradicts that READY report, or
 * `undefined` when it does not. Only evidence the next full check will also see counts: a
 * relevant check still running or failing, a required check not yet reported, a running Actions
 * suite with no relevant check, or a merge state that changed to a non-clean one. Anything else
 * the summary cannot confirm (an unavailable read, incomplete pages) is left to the receipt
 * path, so a summary that merely disagrees cannot hold a PR forever.
 */
export function freshSummaryRegression(
  raw: RawSummaryPr,
  checks: PollSummaryChecks,
  reportMergeStateStatus: string,
): string | undefined {
  if ((checks.inProgress ?? 0) > 0) return "a relevant check is queued or in progress";
  if ((checks.failing ?? 0) > 0) return "a relevant check is failing";
  if ((checks.unreportedRequired?.length ?? 0) > 0) return "a required check has not reported";
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
