import { describe, expect, it } from "vitest";
import {
  fetchMock,
  json,
  registerAppAuthHooks,
  route,
} from "../../test-helpers/github/app-auth.test-support.mts";
import { makeRawPr, makeResponse } from "../../test-helpers/github/batch-fixtures.mts";
import { fetchPrBatch } from "./batch.mts";
import { runWithGithubTransport } from "./transport.mts";

registerAppAuthHooks();

const REPO = { owner: "acme", name: "widgets" };
const rateLimit = {
  cost: 1,
  limit: 5000,
  nodeCount: 1,
  remaining: 4999,
  resetAt: "2030-01-01T00:00:00Z",
  used: 1,
};

/** Serve BatchPr reads and record which credential asked for which operation. */
function serveBatchPr(): Array<{ operation: string; auth: string }> {
  route();
  const base = fetchMock.getMockImplementation()!;
  const seen: Array<{ operation: string; auth: string }> = [];
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    if (new URL(url).pathname !== "/graphql") return base(url, init);
    const { query } = JSON.parse(String(init.body)) as { query: string };
    const operation = /query (\w+)/.exec(query)![1]!;
    const auth = (init.headers as Record<string, string>)["Authorization"] ?? "";
    seen.push({ operation, auth });
    const body =
      operation === "BatchPrViewer"
        ? {
            viewer: { login: "me" },
            repository: { viewerPermission: "WRITE", viewerCanAdminister: true },
            nodes: [{ id: "PR_kgDOAAA", viewerCanUpdate: true }],
          }
        : makeResponse(makeRawPr()).data;
    return json(200, { data: { ...body, _shepherdRateLimit: rateLimit } });
  });
  return seen;
}

describe("BatchPr viewer split at the HTTP boundary", () => {
  it("answers the data read on the app, and spends no user token on a reused tick", async () => {
    const seen = serveBatchPr();
    const snapshot = await runWithGithubTransport("graphql", () =>
      fetchPrBatch(1, REPO, {}, async () => null),
    );
    expect("data" in snapshot && snapshot.data.viewerAuthorization?.viewerCanUpdate).toBe(true);
    expect(seen).toEqual([
      { operation: "BatchPrData", auth: "Bearer inst-token-1" },
      { operation: "BatchPrViewer", auth: "Bearer user-token" },
    ]);

    seen.length = 0;
    const reused = await runWithGithubTransport("graphql", () =>
      fetchPrBatch(1, REPO, {}, async () => "cached"),
    );
    expect(reused).toMatchObject({ reused: "cached" });
    expect(seen).toEqual([{ operation: "BatchPrData", auth: "Bearer inst-token-1" }]);
  });

  it("keeps the single combined read on the user token outside the app's repositories", async () => {
    const seen = serveBatchPr();
    await runWithGithubTransport("graphql", () =>
      fetchPrBatch(1, { owner: "elsewhere", name: "widgets" }, {}),
    );
    expect(seen).toEqual([{ operation: "BatchPr", auth: "Bearer user-token" }]);
  });
});
