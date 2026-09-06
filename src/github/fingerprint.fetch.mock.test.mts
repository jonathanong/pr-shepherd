import { describe, expect, it } from "vitest";
import {
  gqlOk,
  mockFetch,
  registerClientHooks,
} from "../../test-helpers/github/client.test-support.mts";
import { fetchPrFingerprint } from "./fingerprint.mts";
import { EXIT } from "../exit-codes.mts";

registerClientHooks();

const pullRequest = {
  updatedAt: "2026-09-06T00:00:00Z",
  state: "OPEN",
  isDraft: false,
  viewerCanUpdate: true,
  headRefOid: "abc123",
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  reviewDecision: null,
  isInMergeQueue: false,
  comments: { totalCount: 2, nodes: [{ id: "c2" }] },
  reviewThreads: { totalCount: 1, nodes: [{ id: "t1" }] },
  reviews: { totalCount: 3, nodes: [{ id: "r3" }] },
  commits: {
    nodes: [{ commit: { oid: "abc123", statusCheckRollup: { state: "SUCCESS" } } }],
  },
};

describe("fetchPrFingerprint", () => {
  it("maps the cheap preflight query into a comparable fingerprint", async () => {
    mockFetch.mockResolvedValue(gqlOk({ repository: { viewerPermission: "ADMIN", pullRequest } }));
    await expect(fetchPrFingerprint(42, { owner: "owner", name: "repo" })).resolves.toEqual({
      headRefOid: "abc123",
      updatedAt: "2026-09-06T00:00:00Z",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: null,
      isInMergeQueue: false,
      commentCount: 2,
      threadCount: 1,
      reviewCount: 3,
      latestCommentId: "c2",
      latestThreadId: "t1",
      latestReviewId: "r3",
      checkRollupState: "SUCCESS",
      checkSuiteConclusions: "",
      viewerCanUpdate: true,
      viewerPermission: "ADMIN",
    });
  });

  it("maps empty connections and startup-failure suites", async () => {
    mockFetch.mockResolvedValue(
      gqlOk({
        repository: {
          viewerPermission: "WRITE",
          pullRequest: {
            ...pullRequest,
            viewerCanUpdate: false,
            comments: { totalCount: 0, nodes: [] },
            reviewThreads: { totalCount: 0, nodes: [] },
            reviews: { totalCount: 0, nodes: [] },
            commits: {
              nodes: [
                {
                  commit: {
                    oid: "abc123",
                    statusCheckRollup: { state: "FAILURE" },
                    checkSuites: { nodes: [{ conclusion: "STARTUP_FAILURE" }] },
                  },
                },
              ],
            },
          },
        },
      }),
    );
    await expect(fetchPrFingerprint(7, { owner: "owner", name: "repo" })).resolves.toMatchObject({
      latestCommentId: null,
      latestThreadId: null,
      latestReviewId: null,
      checkSuiteConclusions: "STARTUP_FAILURE",
      viewerCanUpdate: false,
      viewerPermission: "WRITE",
    });
  });

  it("throws when the repository is missing", async () => {
    mockFetch.mockResolvedValue(gqlOk({ repository: null }));
    await expect(fetchPrFingerprint(42, { owner: "owner", name: "repo" })).rejects.toThrow(
      "did not include repository owner/repo",
    );
  });

  it("throws when the pull request is missing", async () => {
    mockFetch.mockResolvedValue(gqlOk({ repository: { pullRequest: null } }));
    await expect(fetchPrFingerprint(42, { owner: "owner", name: "repo" })).rejects.toMatchObject({
      exitCode: EXIT.UNAVAILABLE,
    });
  });
});
