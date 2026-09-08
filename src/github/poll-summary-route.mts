import { loadConfig } from "../config/load.mts";
import type {
  PollSummaryChecks,
  PollSummaryCommandOptions,
  PollSummaryItem,
  PollSummaryReview,
} from "../types.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

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
  if (checks.incomplete || review.incomplete) {
    return { action: "fix_code", reasons: ["incomplete-summary-data"] };
  }
  if ((review.actionable ?? 0) > 0) {
    if (opts.merge && raw.isInMergeQueue && actions.workWhileQueued !== true) {
      return { action: "wait", reasons: ["review-work-deferred-while-queued"] };
    }
    return { action: "fix_code", reasons: ["review-work"] };
  }
  if (
    (checks.inProgress ?? 0) > 0 ||
    raw.mergeable === "UNKNOWN" ||
    raw.mergeStateStatus === "UNKNOWN" ||
    raw.mergeStateStatus === "BEHIND"
  ) {
    return { action: "wait", reasons: ["pending-or-unknown"] };
  }
  if (raw.isDraft) {
    if (opts.noAutoMarkReady || actions.autoMarkReady === false) {
      return { action: "wait", reasons: ["draft-auto-mark-ready-disabled"] };
    }
    return raw.viewerCanUpdate
      ? { action: "mark_ready", reasons: ["draft-appears-ready"] }
      : { action: "escalate", reasons: ["mark-ready-authorization-required"] };
  }
  if ((checks.passing ?? 0) === 0) {
    return { action: "fix_code", reasons: ["no-complete-checks"] };
  }
  if (opts.merge && !raw.stack) return { action: "merge", reasons: ["appears-ready"] };
  return { action: "fix_code", reasons: ["authoritative-poll-required"] };
}

export function normalizePollSummaryState(state: string): PollSummaryItem["state"] {
  return state === "OPEN" || state === "CLOSED" || state === "MERGED" ? state : "UNKNOWN";
}
