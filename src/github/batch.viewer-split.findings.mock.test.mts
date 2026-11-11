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
import { BATCH_PR_QUERY } from "./queries.mts";
import {
  empty,
  thread,
  note,
  viewerResponse,
} from "../../test-helpers/github/viewer-split.test-support.mts";

const state = vi.hoisted(() => ({ exhausted: false, fp: "fp-a" }));
vi.mock("./github-app-config.mts", () => ({ findGithubApp: () => ({ appId: 1 }) }));
vi.mock("./app-quota.mts", () => ({ isAppExhausted: () => state.exhausted }));
vi.mock("./http-auth.mts", () => ({
  makeAuthHeaders: async () => ({ fingerprint: state.fp }),
}));
vi.mock("./github-app-token.mts", () => ({
  appCredential: async () => ({ token: "t", appId: 1, installationId: 7 }),
}));

const fetchPrBatch = (...args: Parameters<typeof operation>) =>
  runWithGithubTransport("graphql", () => operation(...args));
registerHooks();

describe("fetchPrBatch — viewer split review findings", () => {
  it("uses the combined query while the app installation's graphql bucket is exhausted", async () => {
    state.exhausted = true;
    mockGraphqlWithRateLimit.mockResolvedValueOnce(makeResponse(makeRawPr(), "me"));
    await fetchPrBatch(42, REPO);
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(1);
    expect(mockGraphqlWithRateLimit.mock.calls[0]![0]).toBe(BATCH_PR_QUERY);
    state.exhausted = false;
  });

  it("gives split fingerprints a different identity under a different user token", async () => {
    const seen: unknown[] = [];
    for (const fp of ["fp-a", "fp-b"]) {
      state.fp = fp;
      mockGraphqlWithRateLimit.mockResolvedValueOnce(makeResponse(makeRawPr()));
      // eslint-disable-next-line no-await-in-loop
      await operation(42, REPO, {}, async (fingerprint) => {
        seen.push(fingerprint);
        return "cached";
      });
    }
    expect(seen[0]).not.toEqual(seen[1]);
    expect(JSON.stringify(seen[0])).toContain("token:fp-a");
  });

  it("matches a bot viewer login, which carries [bot], with its comment author, which does not", async () => {
    const pr = makeRawPr({
      reviewThreads: {
        ...empty,
        nodes: [
          thread("T1", [
            note("C1", "pr-shepherd-bot"),
            note("C2", "coderabbitai"),
            note("C3", "PR-Shepherd-Bot"),
          ]),
        ],
      },
    });
    mockGraphqlWithRateLimit
      .mockResolvedValueOnce(makeResponse(pr))
      .mockResolvedValueOnce(viewerResponse([], "pr-shepherd-bot[bot]"));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewThreads[0]!.comments?.map((c) => c.viewerDidAuthor)).toEqual([
      true,
      undefined,
      true,
    ]);
  });

  it("selects the viewer only in the first chunk of the node reads", async () => {
    const threads = Array.from({ length: 101 }, (_, i) => thread(`T${i}`, []));
    mockGraphqlWithRateLimit
      .mockResolvedValueOnce(
        makeResponse(makeRawPr({ reviewThreads: { ...empty, nodes: threads } })),
      )
      .mockResolvedValue(viewerResponse([]));
    await fetchPrBatch(42, REPO);
    const viewerCalls = mockGraphqlWithRateLimit.mock.calls.slice(1);
    expect(viewerCalls.map((call) => call[1]!.includeViewer)).toEqual([true, false]);
    expect(viewerCalls.every((call) => call[2]?.allowPartialData === true)).toBe(true);
  });
});
