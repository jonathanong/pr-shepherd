import type { IterateResult, RelevantCheck } from "./types.mts";

export function makeIterateResult(action: IterateResult["action"] = "wait"): IterateResult {
  const base = {
    pr: 42,
    repo: "owner/repo",
    status: "IN_PROGRESS" as const,
    state: "OPEN" as const,
    mergeStateStatus: "BLOCKED" as const,
    mergeStatus: "BLOCKED" as const,
    reviewDecision: null as null,
    copilotReviewInProgress: false,
    isDraft: false,
    shouldCancel: false,
    remainingSeconds: 60,
    summary: { passing: 0, skipped: 0, filtered: 0, inProgress: 1 },
    baseBranch: "main",
    checks: [] as RelevantCheck[],
  };
  if (action === "cooldown") return { ...base, action: "cooldown", log: "SKIP: CI still starting" };
  if (action === "wait") return { ...base, action: "wait", log: "WAIT: 0 passing, 1 in-progress" };
  if (action === "mark_ready")
    return { ...base, action: "mark_ready", markedReady: true, log: "MARKED READY: PR 42" };
  if (action === "fix_code") {
    return {
      ...base,
      action: "fix_code",
      fix: {
        mode: "rebase-and-push",
        threads: [],
        actionableComments: [],
        reviewSummaryIds: [],
        surfacedApprovals: [],
        checks: [],
        changesRequestedReviews: [],
        resolveCommand: {
          argv: ["npx", "pr-shepherd", "resolve", "42"],
          requiresHeadSha: true,
          requiresDismissMessage: false,
          hasMutations: false,
        },
        instructions: ["End this iteration."],
        firstLookThreads: [],
        firstLookComments: [],
      },
      cancelled: [],
    };
  }
  if (action === "cancel")
    return {
      ...base,
      action: "cancel",
      reason: "ready-delay-elapsed" as const,
      log: "CANCEL: PR #42 — stopping monitor",
    };
  if (action === "escalate") {
    return {
      ...base,
      action: "escalate",
      escalate: {
        triggers: [],
        unresolvedThreads: [],
        ambiguousComments: [],
        changesRequestedReviews: [],
        suggestion: "check manually",
        humanMessage: "⚠️ /pr-shepherd:monitor paused — needs human direction",
      },
    };
  }
  return { ...base, action: "wait", log: "WAIT: 0 passing, 1 in-progress" };
}
