import { describe, expect, it } from "vitest";
import {
  makeRawPr,
  makeResponse,
  mockGraphqlWithRateLimit,
  registerHooks,
  REPO,
} from "../../test-helpers/github/batch.test-support.mts";
import type { RawThread } from "./batch-raw-types.mts";
import { fetchPrBatch } from "./batch.mts";
import { contextNodes } from "./batch-response.mts";
import { hydrateThreadCommentPages as operation } from "./thread-comments.mts";
import { runWithGithubTransport } from "./transport.mts";

registerHooks();

const hydrateThreadCommentPages = (...args: Parameters<typeof operation>) =>
  runWithGithubTransport("graphql", () => operation(...args));

const comment = (id: string) => ({
  id,
  isMinimized: false,
  author: { login: "reviewer", __typename: "User" },
  body: id,
  url: `https://example.test/${id}`,
  createdAt: "2026-10-01T00:00:00Z",
});

function thread(id: string): RawThread {
  return {
    id,
    isResolved: false,
    isOutdated: false,
    viewerCanReply: true,
    viewerCanResolve: true,
    comments: { pageInfo: { hasNextPage: true, endCursor: "first" }, nodes: [comment(`${id}-1`)] },
  } as unknown as RawThread;
}

const threadPage = (nodes: unknown[]) => ({
  data: { node: { comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } },
});

describe("thread comment pages with a null comment", () => {
  it("withholds that thread, keeps the others, and reports feedback unread", async () => {
    mockGraphqlWithRateLimit
      .mockResolvedValueOnce(threadPage([null, comment("a-2")]))
      .mockResolvedValueOnce(threadPage([comment("b-2")]));

    const result = await hydrateThreadCommentPages([thread("a"), thread("b")]);

    expect(result.threads.map((t) => t.id)).toEqual(["b"]);
    expect(result.unreadNodes).toEqual({ feedback: true });
  });

  it("reports nothing unread when every page is whole", async () => {
    mockGraphqlWithRateLimit.mockResolvedValueOnce(threadPage([comment("a-2")]));
    const result = await hydrateThreadCommentPages([thread("a")]);
    expect(result.threads).toHaveLength(1);
    expect(result.unreadNodes).toBeUndefined();
  });
});

describe("follow-up pages with a null node", () => {
  const first = { hasPreviousPage: true, startCursor: "s1", hasNextPage: false, endCursor: null };

  it("drops a null thread from an earlier page and reports feedback unread", async () => {
    const pr = makeRawPr({
      reviewThreads: { pageInfo: first, nodes: [] },
      commits: { nodes: [{ commit: { oid: "c".repeat(40), statusCheckRollup: null } }] },
    });
    mockGraphqlWithRateLimit.mockResolvedValueOnce(makeResponse(pr)).mockResolvedValueOnce(
      makeResponse({
        reviewThreads: {
          pageInfo: { hasPreviousPage: false, startCursor: null },
          nodes: [null],
        },
      } as never),
    );

    const { data } = await fetchPrBatch(42, REPO);

    expect(data.reviewThreads).toEqual([]);
    expect(data.unreadNodes).toEqual({ feedback: true });
  });
});

describe("contextNodes", () => {
  it("narrows away nulls", () => {
    const run = { __typename: "StatusContext" } as never;
    expect(contextNodes([null, run])).toEqual([run]);
  });
});
