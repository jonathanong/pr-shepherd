import type { PrFingerprint } from "../../src/github/fingerprint.mts";
import type { PrShepherdConfig } from "../../src/config/load.mts";
import { testConfig } from "../config/test-config.mts";

/** The fingerprint suites' baseline config with an rc-shape `overlay` deep-merged on top. */
export function testShepherdConfig(overlay: Record<string, unknown> = {}): PrShepherdConfig {
  return testConfig(
    {
      "bot-usernames": [],
      iterate: { "minimize-comments": "all", "ready-delay-minutes": 10 },
      poll: { "quota-warnings": [] },
      checks: { "ci-trigger-events": ["pull_request"] },
    },
    overlay,
  );
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
    reviewRevisions: "",
    latestCommentId: null,
    latestThreadId: null,
    latestReviewId: null,
    checkRollupState: null,
    checkSuiteConclusions: "",
    checkSuitesComplete: true,
    viewerCanUpdate: true,
    viewerPermission: "ADMIN",
    viewerLogin: "owner",
    stackKey: "",
    threadCommentRevisions: "",
    rulesComplete: true,
    hasMultiCommentThreads: false,
    ...overrides,
  };
}
