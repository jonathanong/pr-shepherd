import type { PrFingerprint } from "../../src/github/fingerprint.mts";
import type { PrShepherdConfig } from "../../src/config/load.mts";

export function testShepherdConfig(overrides: Partial<PrShepherdConfig> = {}): PrShepherdConfig {
  return {
    botUsernames: [],
    ignoreChecks: [],
    iterate: {
      fixAttemptsPerThread: 3,
      stallTimeoutMinutes: 60,
      minimizeApprovals: false,
      minimizeComments: "all",
      behindBaseHint: "",
      resolveOtherHumanThreads: "none",
    },
    watch: { readyDelayMinutes: 10, graphqlQuotaWarnings: [] },
    resolve: { shaPoll: { intervalMs: 2000, maxAttempts: 10 } },
    checks: { ciTriggerEvents: ["pull_request"], ignoreLogLines: [] },
    mergeStatus: { blockingReviewerLogins: [] },
    actions: {
      autoMinimizeSuppressed: true,
      autoMarkReady: true,
      neverCancelRuns: [],
      workWhileQueued: false,
    },
    ...overrides,
  } as PrShepherdConfig;
}

export function testFingerprint(overrides: Partial<PrFingerprint> = {}): PrFingerprint {
  return {
    headRefOid: "abc123",
    updatedAt: "",
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    isInMergeQueue: false,
    isMergeQueueEnabled: false,
    mergePolicy: '{"isMergeQueueEnabled":false}',
    commentCount: 0,
    commentRevisions: "",
    threadCount: 0,
    reviewCount: 0,
    latestCommentId: null,
    latestThreadId: null,
    latestReviewId: null,
    checkRollupState: null,
    checkSuiteConclusions: "",
    checkSuitesComplete: true,
    viewerCanUpdate: true,
    viewerPermission: "ADMIN",
    viewerLogin: "owner",
    ...overrides,
  };
}
