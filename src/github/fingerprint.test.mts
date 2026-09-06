import { describe, expect, it } from "vitest";
import { fingerprintFromRaw, fingerprintsEqual, type PrFingerprint } from "./fingerprint.mts";
import { makeRawPr } from "../../test-helpers/github/batch-fixtures.mts";

function sample(overrides: Partial<PrFingerprint> = {}): PrFingerprint {
  return {
    headRefOid: "abc",
    updatedAt: "2026-09-06T00:00:00Z",
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    isInMergeQueue: false,
    commentCount: 1,
    threadCount: 0,
    reviewCount: 0,
    latestCommentId: "c1",
    latestThreadId: null,
    latestReviewId: null,
    checkRollupState: "SUCCESS",
    checkSuiteConclusions: "",
    viewerCanUpdate: true,
    viewerPermission: "ADMIN",
    ...overrides,
  };
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
});

describe("fingerprintFromRaw", () => {
  it("uses connection totalCount and the newest last:N node", () => {
    const raw = makeRawPr({
      updatedAt: "2026-09-06T00:00:00Z",
      comments: {
        totalCount: 3,
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [{ id: "older" }, { id: "newest" }],
      },
    });
    const fingerprint = fingerprintFromRaw(raw as never);
    expect(fingerprint.commentCount).toBe(3);
    expect(fingerprint.latestCommentId).toBe("newest");
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
              checkSuites: { nodes: [{ conclusion: null }] },
            },
          },
        ],
      },
    });
    const fingerprint = fingerprintFromRaw(raw as never, "WRITE");
    expect(fingerprint.reviewCount).toBe(0);
    expect(fingerprint.checkSuiteConclusions).toBe("");
    expect(fingerprint.viewerPermission).toBe("WRITE");
  });
});
