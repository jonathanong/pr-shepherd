import type { PrFingerprint } from "../../src/github/fingerprint.mts";

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
    ...overrides,
  };
}
