import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphqlWithRateLimit,
} from "../../test-helpers/github/batch-parsers.test-support.mts";
import { fetchPrBatch } from "./batch.mts";

registerHooks();

const noPage = { pageInfo: { hasPreviousPage: false, startCursor: null } };

function makeThread(
  id: string,
  reviewId: string,
  opts: { isResolved?: boolean; isOutdated?: boolean } = {},
) {
  return {
    id,
    isResolved: opts.isResolved ?? false,
    isOutdated: opts.isOutdated ?? false,
    comments: {
      nodes: [
        {
          id: `c-${id}`,
          isMinimized: false,
          url: `https://github.com/t/${id}`,
          author: { __typename: "User", login: "alice" },
          pullRequestReview: { id: reviewId },
          body: "comment",
          path: "src/foo.ts",
          line: 1,
          startLine: null,
          createdAt: "2024-01-01T00:00:00Z",
        },
      ],
    },
  };
}

async function fetchWithConfig(overrides: Parameters<typeof makeRawPr>[0]) {
  mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(makeRawPr(overrides)));
  const { data } = await fetchPrBatch(42, REPO);
  return data;
}

describe("fetchPrBatch — stale CR detection", () => {
  it("active CR (commit == headRefOid): staleReview is absent", async () => {
    const data = await fetchWithConfig({
      headRefOid: "abc123",
      changesRequestedReviews: {
        ...noPage,
        nodes: [
          {
            id: "PRR_1",
            author: { __typename: "User", login: "alice" },
            body: "fix this",
            commit: { oid: "abc123" },
          },
        ],
      },
    });
    expect(data.changesRequestedReviews[0]!.staleReview).toBeUndefined();
  });

  it("stale bot CR (commit != head, all threads resolved): staleReview true, in dismiss list", async () => {
    const data = await fetchWithConfig({
      headRefOid: "newoid",
      changesRequestedReviews: {
        ...noPage,
        nodes: [
          {
            id: "PRR_BOT",
            author: { __typename: "Bot", login: "coderabbitai[bot]" },
            body: "fix it",
            commit: { oid: "oldoid" },
          },
        ],
      },
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [makeThread("T1", "PRR_BOT", { isResolved: true })],
      },
    });
    const review = data.changesRequestedReviews[0]!;
    expect(review.staleReview).toBe(true);
    expect(review.authorType).toBe("Bot");
    expect(review.commitOid).toBe("oldoid");
  });

  it("stale human CR (commit != head, all threads outdated): staleReview true", async () => {
    const data = await fetchWithConfig({
      headRefOid: "newoid",
      changesRequestedReviews: {
        ...noPage,
        nodes: [
          {
            id: "PRR_H",
            author: { __typename: "User", login: "alice" },
            body: "review body",
            commit: { oid: "oldoid" },
          },
        ],
      },
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [makeThread("T2", "PRR_H", { isOutdated: true })],
      },
    });
    const review = data.changesRequestedReviews[0]!;
    expect(review.staleReview).toBe(true);
    expect(review.authorType).toBe("User");
  });

  it("CR with unresolved thread (commit != head, one thread unresolved): NOT stale", async () => {
    const data = await fetchWithConfig({
      headRefOid: "newoid",
      changesRequestedReviews: {
        ...noPage,
        nodes: [
          {
            id: "PRR_X",
            author: { __typename: "User", login: "bob" },
            body: "still active",
            commit: { oid: "oldoid" },
          },
        ],
      },
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          makeThread("T3", "PRR_X", { isResolved: true }),
          makeThread("T4", "PRR_X", { isResolved: false, isOutdated: false }),
        ],
      },
    });
    expect(data.changesRequestedReviews[0]!.staleReview).toBeUndefined();
  });

  it("CR with no threads (commit != head, zero threads): NOT stale (conservative)", async () => {
    const data = await fetchWithConfig({
      headRefOid: "newoid",
      changesRequestedReviews: {
        ...noPage,
        nodes: [
          {
            id: "PRR_NOTHREADS",
            author: { __typename: "User", login: "carol" },
            body: "no threads here",
            commit: { oid: "oldoid" },
          },
        ],
      },
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [],
      },
    });
    expect(data.changesRequestedReviews[0]!.staleReview).toBeUndefined();
  });

  it("CR with mixed resolved/outdated threads: stale when all are resolved or outdated", async () => {
    const data = await fetchWithConfig({
      headRefOid: "newoid",
      changesRequestedReviews: {
        ...noPage,
        nodes: [
          {
            id: "PRR_MIX",
            author: { __typename: "User", login: "dave" },
            body: "mix",
            commit: { oid: "oldoid" },
          },
        ],
      },
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          makeThread("T5", "PRR_MIX", { isResolved: true }),
          makeThread("T6", "PRR_MIX", { isOutdated: true }),
        ],
      },
    });
    expect(data.changesRequestedReviews[0]!.staleReview).toBe(true);
  });

  it("CR missing commit field: NOT stale (no commitOid)", async () => {
    const data = await fetchWithConfig({
      headRefOid: "newoid",
      changesRequestedReviews: {
        ...noPage,
        nodes: [
          {
            id: "PRR_NOCOMMIT",
            author: { __typename: "User", login: "erin" },
            body: "no commit",
          },
        ],
      },
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [makeThread("T7", "PRR_NOCOMMIT", { isResolved: true })],
      },
    });
    expect(data.changesRequestedReviews[0]!.staleReview).toBeUndefined();
    expect(data.changesRequestedReviews[0]!.commitOid).toBeUndefined();
  });
});
