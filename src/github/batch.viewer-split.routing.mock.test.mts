import { describe, it, expect, vi } from "vitest";
import {
  registerHooks,
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphqlWithRateLimit,
} from "../../test-helpers/github/batch.test-support.mts";
import { fetchPrBatch as operation } from "./batch.mts";
import { runWithGithubTransport } from "./transport.mts";
import {
  BATCH_PR_DATA_QUERY,
  BATCH_PR_PAGE_DATA_QUERY,
  BATCH_PR_QUERY,
  BATCH_PR_RECEIPT_QUERY,
  BATCH_PR_VIEWER_QUERY,
  REVIEW_THREAD_COMMENTS_DATA_QUERY,
} from "./queries.mts";

const app = vi.hoisted(() => ({ covered: true }));
vi.mock("./github-app-config.mts", () => ({
  findGithubApp: () => (app.covered ? { appId: 1 } : undefined),
}));

const fetchPrBatch = (...args: Parameters<typeof operation>) =>
  runWithGithubTransport("graphql", () => operation(...args));
import {
  empty,
  thread,
  note,
  viewerResponse,
} from "../../test-helpers/github/viewer-split.test-support.mts";
registerHooks();

describe("fetchPrBatch — viewer split paging and routing", () => {
  it("splits more than 100 node ids across viewer requests", async () => {
    app.covered = true;
    const threads = Array.from({ length: 101 }, (_, i) => thread(`T${i}`, []));
    mockGraphqlWithRateLimit
      .mockResolvedValueOnce(
        makeResponse(makeRawPr({ reviewThreads: { ...empty, nodes: threads } })),
      )
      .mockResolvedValueOnce(viewerResponse([{ id: "T0", viewerCanReply: true }]))
      .mockResolvedValueOnce(viewerResponse([{ id: "T100", viewerCanResolve: true }]));
    const { data } = await fetchPrBatch(42, REPO);
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(3);
    expect(data.reviewThreads[0]!.viewerCanReply).toBe(true);
    expect(data.reviewThreads[100]!.viewerCanResolve).toBe(true);
  });

  it("pages threads and thread comments without viewer fields", async () => {
    app.covered = true;
    const first = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: true, startCursor: "c1" },
        nodes: [
          thread("T2", [note("C1", "me")], {
            comments: { pageInfo: { hasNextPage: true, endCursor: "cc" }, nodes: [] },
          }),
        ],
      },
    });
    mockGraphqlWithRateLimit
      .mockResolvedValueOnce(makeResponse(first))
      .mockResolvedValueOnce({
        data: {
          repository: {
            pullRequest: { reviewThreads: { ...empty, nodes: [thread("T1", [note("C0", "Me")])] } },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          node: {
            __typename: "PullRequestReviewThread",
            comments: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [note("C9", "ME")],
            },
          },
        },
      })
      .mockResolvedValueOnce(viewerResponse([]));
    const { data } = await fetchPrBatch(42, REPO);
    const queries = mockGraphqlWithRateLimit.mock.calls.map((call) => call[0]);
    expect(queries).toEqual([
      BATCH_PR_DATA_QUERY,
      BATCH_PR_PAGE_DATA_QUERY,
      REVIEW_THREAD_COMMENTS_DATA_QUERY,
      BATCH_PR_VIEWER_QUERY,
    ]);
    expect(data.reviewThreads.flatMap((t) => t.comments?.map((c) => c.viewerDidAuthor))).toEqual([
      true,
      true,
    ]);
  });

  it("keeps one combined request when no app covers the repository", async () => {
    app.covered = false;
    mockGraphqlWithRateLimit.mockResolvedValueOnce(makeResponse(makeRawPr(), "me"));
    const { data } = await fetchPrBatch(42, REPO);
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(1);
    expect(mockGraphqlWithRateLimit.mock.calls[0]![0]).toBe(BATCH_PR_QUERY);
    expect(data.viewerLogin).toBe("me");
  });

  it("keeps the READY receipt read combined on the user's token", async () => {
    app.covered = true;
    mockGraphqlWithRateLimit.mockResolvedValueOnce(makeResponse(makeRawPr(), "me"));
    await fetchPrBatch(42, REPO, { includeReceiptSummary: true });
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(1);
    expect(mockGraphqlWithRateLimit.mock.calls[0]![0]).toBe(BATCH_PR_RECEIPT_QUERY);
  });

  it("spends no viewer request when the first page is reused", async () => {
    app.covered = true;
    mockGraphqlWithRateLimit.mockResolvedValueOnce(makeResponse(makeRawPr()));
    const result = await runWithGithubTransport("graphql", () =>
      operation(42, REPO, {}, async () => "cached"),
    );
    expect(result).toMatchObject({ reused: "cached" });
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(1);
  });

  it("carries the stack topology only once this snapshot's viewer read supplied its viewer", async () => {
    app.covered = true;
    const sha = "0".repeat(40);
    const pr = makeRawPr({
      baseRefName: "main",
      stack: {
        number: 7,
        size: 1,
        baseRefName: "main",
        entries: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              position: 1,
              pullRequest: {
                number: 42,
                state: "OPEN",
                headRefName: "feature",
                headRefOid: sha,
                baseRefName: "main",
                baseRefOid: sha,
              },
            },
          ],
        },
        trunkEntry: { nodes: [] },
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValueOnce(makeResponse(pr));
    const reused = await runWithGithubTransport("graphql", () =>
      operation(42, REPO, {}, async () => "cached"),
    );
    expect(reused).toMatchObject({ reused: "cached" });
    expect((reused as { stackEvidence?: unknown }).stackEvidence).toBeUndefined();

    mockGraphqlWithRateLimit
      .mockResolvedValueOnce(makeResponse(pr))
      .mockResolvedValueOnce(viewerResponse([]));
    const { stackEvidence } = await fetchPrBatch(42, REPO);
    expect(stackEvidence?.topology).toMatchObject({
      stackNumber: 7,
      viewerLogin: "Me",
      viewerCanAdminister: false,
    });
  });
});
