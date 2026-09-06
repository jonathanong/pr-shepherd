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
    commentCount: 0,
    threadCount: 0,
    reviewCount: 0,
    latestCommentId: null,
    latestThreadId: null,
    latestReviewId: null,
    checkRollupState: null,
    checkSuiteConclusions: "",
    viewerCanUpdate: true,
    viewerPermission: "ADMIN",
    ...overrides,
  };
}
