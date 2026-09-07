/* eslint-disable max-lines */
import { describe, expect, it } from "vitest";
import { fingerprintFromRaw, fingerprintsEqual } from "./fingerprint.mts";
import { makeRawPr } from "../../test-helpers/github/batch-fixtures.mts";
import { testFingerprint } from "../../test-helpers/github/fingerprint-fixture.mts";

function sample(overrides: Parameters<typeof testFingerprint>[0] = {}) {
  return testFingerprint({
    headRefOid: "abc",
    updatedAt: "2026-09-06T00:00:00Z",
    commentCount: 1,
    latestCommentId: "c1",
    checkRollupState: "SUCCESS",
    ...overrides,
  });
}

describe("fingerprintsEqual", () => {
  it("is true for identical snapshots", () => {
    expect(fingerprintsEqual(sample(), sample())).toBe(true);
  });

  it("is false when check-suite conclusions change with the same rollup state", () => {
    expect(
      fingerprintsEqual(
        sample({ checkRollupState: "FAILURE", checkSuiteConclusions: "FAILURE" }),
        sample({ checkRollupState: "FAILURE", checkSuiteConclusions: "STARTUP_FAILURE" }),
      ),
    ).toBe(false);
  });

  it("is false when a comment arrives", () => {
    expect(fingerprintsEqual(sample(), sample({ commentCount: 2, latestCommentId: "c2" }))).toBe(
      false,
    );
  });

  it("is false when a review is edited in place", () => {
    expect(
      fingerprintsEqual(sample(), sample({ reviewRevisions: "r1:2026-09-06T02:00:00Z" })),
    ).toBe(false);
  });

  it("is false when a comment is edited in place or the viewer changes", () => {
    expect(
      fingerprintsEqual(sample(), sample({ commentRevisions: "c1:2026-09-06T02:00:00Z" })),
    ).toBe(false);
    expect(fingerprintsEqual(sample(), sample({ viewerLogin: "other" }))).toBe(false);
  });

  it("is false when merge-queue enablement or policy changes", () => {
    expect(fingerprintsEqual(sample(), sample({ isMergeQueueEnabled: true }))).toBe(false);
    expect(fingerprintsEqual(sample(), sample({ mergePolicy: '{"required":1}' }))).toBe(false);
  });
});

describe("fingerprintFromRaw", () => {
  it("uses connection totalCount and the newest last:N node", () => {
    const raw = makeRawPr({
      updatedAt: "2026-09-06T00:00:00Z",
      comments: {
        totalCount: 3,
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          { id: "older", updatedAt: "2026-09-01T00:00:00Z" },
          { id: "newest", updatedAt: "2026-09-06T00:00:00Z" },
        ],
      },
    });
    const fingerprint = fingerprintFromRaw(raw as never);
    expect(fingerprint.commentCount).toBe(3);
    expect(fingerprint.latestCommentId).toBe("newest");
    expect(fingerprint.commentRevisions).toBe(
      "older:2026-09-01T00:00:00Z,newest:2026-09-06T00:00:00Z",
    );
    expect(
      fingerprintFromRaw(makeRawPr({ comments: { nodes: [{ id: "c1" }] } }) as never)
        .commentRevisions,
    ).toBe("c1:");
  });

  it("treats missing allReviews and null suite conclusions as empty", () => {
    const raw = makeRawPr({
      allReviews: undefined,
      commits: {
        nodes: [
          {
            commit: {
              oid: "abc123",
              statusCheckRollup: { state: "FAILURE" },
              checkSuites: {
                pageInfo: { hasNextPage: false },
                nodes: [{ id: "CS_1", conclusion: null }],
              },
            },
          },
        ],
      },
    });
    const fingerprint = fingerprintFromRaw(raw as never, "WRITE");
    expect(fingerprint.reviewCount).toBe(0);
    expect(fingerprint.checkSuiteConclusions).toBe("CS_1:");
    expect(fingerprint.checkSuitesComplete).toBe(true);
    expect(fingerprint.viewerPermission).toBe("WRITE");
  });

  it("treats a complete suite page with no nodes as empty", () => {
    const raw = makeRawPr({
      commits: {
        nodes: [
          {
            commit: {
              oid: "abc123",
              statusCheckRollup: { state: "SUCCESS" },
              checkSuites: { pageInfo: { hasNextPage: false } },
            },
          },
        ],
      },
    });
    const fingerprint = fingerprintFromRaw(raw as never);
    expect(fingerprint.checkSuiteConclusions).toBe("");
    expect(fingerprint.checkSuitesComplete).toBe(true);
  });

  it("uses an empty suite identity when id and workflow run are missing", () => {
    const raw = makeRawPr({
      commits: {
        nodes: [
          {
            commit: {
              oid: "abc123",
              statusCheckRollup: { state: "FAILURE" },
              checkSuites: {
                pageInfo: { hasNextPage: false },
                nodes: [{ conclusion: "FAILURE" }],
              },
            },
          },
        ],
      },
    });
    expect(fingerprintFromRaw(raw as never).checkSuiteConclusions).toBe(":FAILURE");
  });

  it("falls back to workflow run id when a suite has no node id", () => {
    const raw = makeRawPr({
      commits: {
        nodes: [
          {
            commit: {
              oid: "abc123",
              statusCheckRollup: { state: "SUCCESS" },
              checkSuites: {
                pageInfo: { hasNextPage: false },
                nodes: [{ conclusion: "SUCCESS", workflowRun: { databaseId: 9 } }],
              },
            },
          },
        ],
      },
    });
    expect(fingerprintFromRaw(raw as never).checkSuiteConclusions).toBe("9:SUCCESS");
  });

  it("does not treat a truncated check-suite page as complete", () => {
    const raw = makeRawPr({
      commits: {
        nodes: [
          {
            commit: {
              oid: "abc123",
              statusCheckRollup: { state: "SUCCESS" },
              checkSuites: {
                pageInfo: { hasNextPage: true },
                nodes: [{ id: "CS_1", conclusion: "SUCCESS" }],
              },
            },
          },
        ],
      },
    });
    expect(fingerprintFromRaw(raw as never).checkSuitesComplete).toBe(false);
  });

  it("encodes merge-queue enablement and branch rules into mergePolicy", () => {
    const raw = makeRawPr({
      isMergeQueueEnabled: true,
      baseRef: {
        branchProtectionRule: {
          requiresApprovingReviews: true,
          requiredApprovingReviewCount: 2,
          requiresConversationResolution: true,
          requiresStatusChecks: false,
          requiredStatusCheckContexts: null,
        },
        rules: { nodes: [] },
      },
    });
    const fingerprint = fingerprintFromRaw(raw as never);
    expect(fingerprint.isMergeQueueEnabled).toBe(true);
    expect(fingerprint.mergePolicy).toContain('"isMergeQueueEnabled":true');
    expect(fingerprint.mergePolicy).toContain('"requiredApprovingReviewCount":2');
  });
});
