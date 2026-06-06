import type { MergeStatusResult, ShepherdStatus } from "../types.mts";
import type { CiVerdict } from "../checks/classify.mts";

export function computeStatus(
  verdict: CiVerdict,
  unresolvedThreads: number,
  unresolvedComments: number,
  mergeStatus: MergeStatusResult,
  changesRequestedReviews: number,
): ShepherdStatus {
  // Merge conflicts are always terminal regardless of CI state.
  if (mergeStatus.status === "CONFLICTS") return "FAILING";
  // Check CI state before merge-blocking states: BLOCKED/UNSTABLE/BEHIND are
  // often caused by CI not having passed yet, so they shouldn't mask IN_PROGRESS.
  // These merge-blocking states become PENDING (not FAILING) once CI is resolved.
  if (verdict.anyFailing) return "FAILING";
  if (verdict.anyInProgress) return "IN_PROGRESS";
  // BLOCKED with no remaining shepherd work — hand off via ready-delay regardless of why GitHub
  // is BLOCKED (review pending, insufficient approvals, branch-protection rule, etc.).
  // Requires hasChecks so that a PR with zero relevant checks (CI never started, or all
  // filtered/skipped) doesn't prematurely trigger READY before any check has reported.
  // Exception: UNSTABLE with ignored checks — UNSTABLE means only non-required checks are
  // pending/failing, and if those are all ignored the handoff is safe even with no other checks.
  // BLOCKED is excluded from the ignoredNames extension: BLOCKED can mean required checks haven't
  // started, and handing off prematurely there risks a broken merge attempt.
  // blockingBotReviewInProgress is still excluded — a bot review is shepherd's problem, not a hand-off.
  const hasRelevantPassingChecks =
    verdict.hasChecks || (mergeStatus.status === "UNSTABLE" && verdict.ignoredNames.length > 0);
  if (
    verdict.allPassed &&
    hasRelevantPassingChecks &&
    unresolvedThreads === 0 &&
    unresolvedComments === 0 &&
    changesRequestedReviews === 0 &&
    (mergeStatus.status === "BLOCKED" || mergeStatus.status === "UNSTABLE") &&
    !mergeStatus.blockingBotReviewInProgress
  ) {
    return "READY";
  }
  if (
    mergeStatus.status === "BLOCKED" ||
    mergeStatus.status === "UNSTABLE" ||
    mergeStatus.status === "BEHIND"
  )
    return "PENDING";
  if (mergeStatus.status === "UNKNOWN") return "UNKNOWN";
  if (changesRequestedReviews > 0 || unresolvedThreads > 0 || unresolvedComments > 0)
    return "UNRESOLVED_COMMENTS";
  // DRAFT is treated the same as CLEAN for readiness — marking the PR ready resolves it.
  if ((mergeStatus.status === "CLEAN" || mergeStatus.status === "DRAFT") && verdict.allPassed)
    return "READY";
  return "UNKNOWN";
}
