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
    mockFetch.mockResolvedValue(gqlOk({ repository: { pullRequest } }));
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
