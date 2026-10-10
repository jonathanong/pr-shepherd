import { loadConfig } from "../config/load.mts";
import type {
  PollSummaryChecks,
  PollSummaryCommandOptions,
  PollSummaryItem,
  PollSummaryReview,
} from "../types.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import { isKnownMergeStateStatus, transportReadinessGaps } from "./transport-evidence.mts";
import { canGenerateGithubMutation } from "./mutation-policy.mts";
import { getGithubTransport, isCcrTransport } from "./transport.mts";

export function routePollSummary(
  raw: RawSummaryPr,
  checks: PollSummaryChecks,
  review: PollSummaryReview,
  opts: PollSummaryCommandOptions,
): Pick<PollSummaryItem, "action" | "reasons"> {
  const actions = loadConfig().actions;
  const state = normalizePollSummaryState(raw.state);
  if (state === "MERGED" || state === "CLOSED") {
    return { action: "cancel", reasons: [state.toLowerCase()] };
  }
  if (raw.mergeable === "CONFLICTING" || raw.mergeStateStatus === "DIRTY") {
    return { action: "fix_code", reasons: ["merge-conflicts"] };
  }
  if ((checks.failing ?? 0) > 0) return { action: "fix_code", reasons: ["failing-checks"] };
  if ((review.actionable ?? 0) > 0) {
    if (opts.merge && raw.isInMergeQueue && actions.workWhileQueued !== true) {
      return { action: "wait", reasons: ["review-work-deferred-while-queued"] };
    }
    return { action: "fix_code", reasons: ["review-work"] };
  }
  if (
    (checks.unreportedRequired?.length ?? 0) > 0 &&
    checks.actionsWorkflowInProgress !== true &&
    (checks.inProgress ?? 0) === 0
  ) {
    return { action: "fix_code", reasons: ["unreported-required-checks"] };
  }
  if (
    (checks.inProgress ?? 0) > 0 ||
    !isKnownMergeStateStatus(raw.mergeStateStatus) ||
    raw.mergeable === "UNKNOWN" ||
    raw.mergeStateStatus === "UNKNOWN"
  )
    return { action: "wait", reasons: ["pending-or-unknown"] };
  if (transportReadinessGaps(raw, raw.mergeStateStatus).length > 0)
    return { action: "escalate", reasons: ["transport-unsupported"] };
  if (
    raw.mergeable === "UNKNOWN" ||
    raw.mergeStateStatus === "UNKNOWN" ||
    raw.mergeStateStatus === "BEHIND" ||
    raw.mergeStateStatus === "BLOCKED" ||
    raw.mergeStateStatus === "HAS_HOOKS"
  ) {
    return { action: "wait", reasons: ["pending-or-unknown"] };
  }
  if (raw.isDraft) {
    const autoMarkReadyDisabled = opts.noAutoMarkReady || actions.autoMarkReady === false;
    // The stack selector asks the agent to mark a disabled draft ready, so
    // that transition needs the same capability as the automatic one.
    if (
      !canGenerateGithubMutation(raw.viewerCanUpdate, "ready") &&
      (!autoMarkReadyDisabled || opts.stackPrNumber !== undefined)
    ) {
      const unsupported =
        getGithubTransport() === "rest" && raw.viewerCanUpdate !== false && !isCcrTransport();
      if (unsupported) return { action: "escalate", reasons: ["transport-unsupported"] };
      return { action: "escalate", reasons: ["mark-ready-authorization-required"] };
    }
    return autoMarkReadyDisabled
      ? { action: "wait", reasons: ["draft-auto-mark-ready-disabled"] }
      : { action: "mark_ready", reasons: ["draft-appears-ready"] };
  }
  if (opts.merge && (raw.isInMergeQueue || raw.autoMergeRequest)) {
    return {
      action: "wait",
      reasons: [raw.isInMergeQueue ? "already-in-merge-queue" : "already-auto-merging"],
    };
  }
  if (opts.merge && raw.stack && opts.stackPrNumber === undefined) {
    return { action: "fix_code", reasons: ["authoritative-poll-required"] };
  }
  if (opts.merge && raw.stack) {
    return { action: "merge", reasons: ["appears-ready"] };
  }
  if (opts.merge && !raw.stack) return { action: "merge", reasons: ["appears-ready"] };
  return { action: "cancel", reasons: ["appears-ready"] };
}

export function normalizePollSummaryState(state: string): PollSummaryItem["state"] {
  return state === "OPEN" || state === "CLOSED" || state === "MERGED" ? state : "UNKNOWN";
}
