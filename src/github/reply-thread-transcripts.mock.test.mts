import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));

import { graphqlWithRateLimit } from "./client.mts";
import { fetchReplyThreadTranscripts } from "./reply-thread-transcripts.mts";
import { REPLY_THREAD_COMMENTS_QUERY, REPLY_THREAD_TRANSCRIPTS_QUERY } from "./queries.mts";
import { GitHubRequestError } from "./errors.mts";

const graphql = vi.mocked(graphqlWithRateLimit);
const repo = { owner: "acme", name: "widgets" };

function node(
  id: string,
  bodies: string[],
  options: { owner?: string; pr?: number; hasNextPage?: boolean; cursor?: string | null } = {},
) {
  return {
    __typename: "PullRequestReviewThread",
    id,
    pullRequest: {
      number: options.pr ?? 42,
      repository: { nameWithOwner: options.owner ?? "acme/widgets" },
    },
    comments: {
      pageInfo: {
        hasNextPage: options.hasNextPage ?? false,
        endCursor: options.cursor ?? null,
      },
      nodes: bodies.map((body) => ({ body })),
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("requested reply-thread transcripts", () => {
  it("reads only requested IDs and accepts only complete threads owned by the target PR", async () => {
    graphql.mockResolvedValueOnce({
      data: {
        nodes: [
          node("t-1", ["root", "reviewer reply"]),
          node("t-2", ["other repo"], { owner: "elsewhere/widgets" }),
          node("t-3", ["other PR"], { pr: 99 }),
          node("not-requested", ["surprise"]),
          node("t-4", ["incomplete"], { hasNextPage: true }),
        ],
      },
    });

    const transcripts = await fetchReplyThreadTranscripts(42, repo, ["t-1", "t-2", "t-3", "t-4"]);
    expect([...transcripts]).toEqual([["t-1", "root\n\n--- thread comment ---\n\nreviewer reply"]]);
    expect(graphql).toHaveBeenCalledTimes(1);
    expect(graphql).toHaveBeenCalledWith(REPLY_THREAD_TRANSCRIPTS_QUERY, {
      ids: ["t-1", "t-2", "t-3", "t-4"],
    });
  });

  it("paginates the full transcript before producing a marker body", async () => {
    graphql
      .mockResolvedValueOnce({
        data: { nodes: [node("t-1", ["root"], { hasNextPage: true, cursor: "c1" })] },
      })
      .mockResolvedValueOnce({
        data: { node: node("t-1", ["reply"]) },
      });
    const transcripts = await fetchReplyThreadTranscripts(42, repo, ["t-1"]);
    expect(transcripts.get("t-1")).toBe("root\n\n--- thread comment ---\n\nreply");
    expect(graphql).toHaveBeenNthCalledWith(2, REPLY_THREAD_COMMENTS_QUERY, {
      id: "t-1",
      cursor: "c1",
    });
  });

  it("skips a marker when a later page has no usable next cursor", async () => {
    graphql
      .mockResolvedValueOnce({
        data: { nodes: [node("t-1", ["root"], { hasNextPage: true, cursor: "c1" })] },
      })
      .mockResolvedValueOnce({
        data: { node: node("t-1", ["reply"], { hasNextPage: true }) },
      });
    expect(await fetchReplyThreadTranscripts(42, repo, ["t-1"])).toEqual(new Map());
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("skips a marker when pagination repeats a cursor", async () => {
    graphql
      .mockResolvedValueOnce({
        data: { nodes: [node("t-1", ["root"], { hasNextPage: true, cursor: "c1" })] },
      })
      .mockResolvedValueOnce({
        data: { node: node("t-1", ["reply"], { hasNextPage: true, cursor: "c1" }) },
      });
    expect(await fetchReplyThreadTranscripts(42, repo, ["t-1"])).toEqual(new Map());
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("does not request a later page after the first batch reports zero remaining", async () => {
    graphql.mockResolvedValueOnce({
      data: { nodes: [node("t-1", ["root"], { hasNextPage: true, cursor: "c1" })] },
      rateLimit: { remaining: 0, limit: 5000, resetAt: 1 },
    });
    expect(await fetchReplyThreadTranscripts(42, repo, ["t-1"])).toEqual(new Map());
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("omits marker bookkeeping after a throttled first-page read", async () => {
    graphql.mockRejectedValueOnce(new GitHubRequestError("secondary rate limit", { status: 403 }));
    expect(await fetchReplyThreadTranscripts(42, repo, ["t-1"])).toEqual(new Map());
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("omits only the incomplete marker when a follow-up page fails", async () => {
    graphql
      .mockResolvedValueOnce({
        data: { nodes: [node("t-1", ["root"], { hasNextPage: true, cursor: "c1" })] },
      })
      .mockRejectedValueOnce(new Error("transient read failure"));
    expect(await fetchReplyThreadTranscripts(42, repo, ["t-1"])).toEqual(new Map());
  });

  it("accepts a complete final page that also exhausts the quota", async () => {
    graphql
      .mockResolvedValueOnce({
        data: { nodes: [node("t-1", ["root"], { hasNextPage: true, cursor: "c1" })] },
      })
      .mockResolvedValueOnce({
        data: { node: node("t-1", ["reply"]) },
        rateLimit: { remaining: 0, limit: 5000, resetAt: 1 },
      });
    const transcripts = await fetchReplyThreadTranscripts(42, repo, ["t-1"]);
    expect(transcripts.get("t-1")).toBe("root\n\n--- thread comment ---\n\nreply");
  });

  it("omits a marker when a page resolves to another thread", async () => {
    graphql
      .mockResolvedValueOnce({
        data: { nodes: [node("t-1", ["root"], { hasNextPage: true, cursor: "c1" })] },
      })
      .mockResolvedValueOnce({ data: { node: node("t-other", ["reply"]) } });
    expect(await fetchReplyThreadTranscripts(42, repo, ["t-1"])).toEqual(new Map());
  });

  it("batches at most 20 requested IDs per query", async () => {
    const ids = Array.from({ length: 21 }, (_, index) => `t-${index}`);
    graphql.mockResolvedValueOnce({ data: { nodes: [node("t-0", ["first"])] } });
    graphql.mockResolvedValueOnce({ data: { nodes: [node("t-20", ["last"])] } });
    const transcripts = await fetchReplyThreadTranscripts(42, repo, ids);
    expect(graphql).toHaveBeenCalledTimes(2);
    expect(graphql.mock.calls[0]?.[1]).toEqual({ ids: ids.slice(0, 20) });
    expect(graphql.mock.calls[1]?.[1]).toEqual({ ids: ["t-20"] });
    expect([...transcripts.keys()]).toEqual(["t-0", "t-20"]);
  });
});
