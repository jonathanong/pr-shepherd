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
import { BATCH_PR_DATA_QUERY, BATCH_PR_VIEWER_QUERY } from "./queries.mts";

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

describe("fetchPrBatch — viewer split with a covering GitHub App", () => {
  it("reads data without viewer fields, then overlays them from one viewer query", async () => {
    app.covered = true;
    const pr = makeRawPr({
      viewerDidAuthor: undefined,
      viewerCanUpdate: undefined,
      headRepository: { nameWithOwner: "o/r", viewerPermission: undefined },
      reviewThreads: {
        ...empty,
        nodes: [
          thread("T1", [note("C1", "me"), note("C2", "other"), note("C3", null)]),
          thread("T2", []),
        ],
      },
      comments: { ...empty, nodes: [{ id: "IC1", isMinimized: false, body: "x", url: "u" }] },
      reviewSummaries: {
        ...empty,
        nodes: [{ id: "RS1", isMinimized: false, body: "s", author: { login: "bot" } }],
      },
      approvedReviews: {
        ...empty,
        nodes: [{ id: "AR1", isMinimized: false, body: "", author: { login: "bot" } }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValueOnce(makeResponse(pr)).mockResolvedValueOnce(
      viewerResponse([
        null,
        {
          id: "PR_kgDOAAA",
          viewerDidAuthor: true,
          viewerCanUpdate: true,
          viewerCanEnableAutoMerge: true,
          viewerCanEditFiles: false,
          headRepository: { viewerPermission: "ADMIN" },
        },
        { id: "T1", viewerCanReply: true, viewerCanResolve: true },
        { id: "IC1", viewerCanMinimize: true },
        { id: "RS1", viewerCanMinimize: true },
      ]),
    );
    const { data, rateLimit } = await fetchPrBatch(42, REPO);
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(2);
    expect(mockGraphqlWithRateLimit.mock.calls[0]![0]).toBe(BATCH_PR_DATA_QUERY);
    const [query, variables] = mockGraphqlWithRateLimit.mock.calls[1]!;
    expect(query).toBe(BATCH_PR_VIEWER_QUERY);
    expect(variables).toMatchObject({ ids: ["PR_kgDOAAA", "T1", "T2", "IC1", "RS1", "AR1"] });
    expect(data.viewerLogin).toBe("Me");
    expect(data.viewerAuthorization).toEqual({
      repositoryPermission: "WRITE",
      viewerCanAdminister: false,
      viewerDidAuthor: true,
      viewerCanUpdate: true,
      viewerCanEnableAutoMerge: true,
      viewerCanEditFiles: false,
      headRepositoryPermission: "ADMIN",
    });
    const [t1, t2] = data.reviewThreads;
    expect([t1!.viewerCanReply, t1!.viewerCanResolve]).toEqual([true, true]);
    expect([t2!.viewerCanReply, t2!.viewerCanResolve]).toEqual([false, false]);
    expect(t1!.comments?.map((c) => c.viewerDidAuthor)).toEqual([true, undefined, undefined]);
    expect(t1!.viewerDidAuthor).toBe(true);
    expect(data.comments[0]!.viewerCanMinimize).toBe(true);
    expect(data.reviewSummaries[0]!.viewerCanMinimize).toBe(true);
    expect(data.approvedReviews[0]!.viewerCanMinimize).toBe(false);
    expect(rateLimit?.remaining).toBe(4000);
  });

  it("fails closed when the viewer read returns no node, login, or head repository", async () => {
    app.covered = true;
    const pr = makeRawPr({
      headRepository: null,
      reviewThreads: { ...empty, nodes: [thread("T1", [note("C1", "me")])] },
    });
    mockGraphqlWithRateLimit
      .mockResolvedValueOnce(makeResponse(pr))
      .mockResolvedValueOnce({ data: viewerResponse([], null).data });
    const { data, rateLimit } = await fetchPrBatch(42, REPO);
    expect(rateLimit).toBeUndefined();
    expect(data.viewerLogin).toBeUndefined();
    expect(data.viewerAuthorization).toMatchObject({
      viewerCanUpdate: false,
      viewerDidAuthor: false,
      headRepositoryPermission: null,
    });
    expect(data.reviewThreads[0]).toMatchObject({ viewerCanReply: false, viewerCanResolve: false });
    expect(data.reviewThreads[0]!.comments![0]!.viewerDidAuthor).toBeUndefined();
  });

  it("fails when the viewer read has no repository", async () => {
    app.covered = true;
    mockGraphqlWithRateLimit
      .mockResolvedValueOnce(makeResponse())
      .mockResolvedValueOnce({ data: { viewer: null, repository: null, nodes: [] } });
    await expect(fetchPrBatch(42, REPO)).rejects.toThrow(/viewer read did not include/);
  });
});
