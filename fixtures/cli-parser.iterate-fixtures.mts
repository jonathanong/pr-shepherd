import type { IterateResult, RelevantCheck } from "../src/types.mts";

export function makeIterateResult(action: IterateResult["action"] = "wait"): IterateResult {
  const base = {
    pr: 42,
    repo: "owner/repo",
    status: "IN_PROGRESS" as const,
    state: "OPEN" as const,
    mergeStateStatus: "BLOCKED" as const,
    mergeStatus: "BLOCKED" as const,
    reviewDecision: null,
    blockingBotReviewInProgress: false,
    isDraft: false,
    shouldCancel: false,
    remainingSeconds: 60,
    summary: { passing: 0, skipped: 0, filtered: 0, inProgress: 1 },
    baseBranch: "main",
    branchProtection: null,
    checks: [] as RelevantCheck[],
    inProgressChecks: [],
    activity: {
      commitCount: 1,
      reviewRoundCount: 0,
      latestCommitCommittedAtUnix: 1_700_000_000,
      reviewItemsSinceLatestCommit: [],
    },
  };
  if (action === "wait") return { ...base, action: "wait", log: "WAIT: 0 passing, 1 in-progress" };
  if (action === "mark_ready")
    return { ...base, action: "mark_ready", markedReady: true, log: "MARKED READY: PR 42" };
  if (action === "fix_code") {
    return {
      ...base,
      action: "fix_code",
      fix: {
        threads: [],
        resolutionOnlyThreads: [],
        actionableComments: [],
        reviewSummaryIds: [],
        firstLookSummaries: [],
        editedSummaries: [],
        surfacedApprovals: [],
        checks: [],
        changesRequestedReviews: [],
        resolveCommand: {
          argv: ["pr-shepherd", "resolve", "42"],
          requiresHeadSha: true,
          requiresDismissMessage: false,
          hasMutations: false,
        },
        instructions: [
          "Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.",
        ],
        firstLookThreads: [],
        firstLookComments: [],
        inProgressRunIds: [],
        protectedRuns: [],
      },
      cancelled: [],
    };
  }
  if (action === "cancel")
    return {
      ...base,
      action: "cancel",
      reason: "ready-delay-elapsed" as const,
      log: "CANCEL: PR #42 — stopping",
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
        humanMessage: "⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required",
      },
    };
  }
  return { ...base, action: "wait", log: "WAIT: 0 passing, 1 in-progress" };
}
