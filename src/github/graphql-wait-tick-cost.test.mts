import { describe, expect, it } from "vitest";
import { serve, repo, wire } from "../../test-helpers/github/rest-read.test-support.mts";
import { makeRawPr, makeResponse } from "../../test-helpers/github/batch-fixtures.mts";
import { freshLoadConfig } from "../../test-helpers/config/load-test-support.mts";
import { runIterate } from "../commands/iterate/index.mts";
import { runWithGithubTransport } from "./transport.mts";

/**
 * GraphQL requests per wait tick, measured at the HTTP boundary. BatchPr's first page carries
 * the fingerprint, so an unchanged tick is that one request and a changed tick continues it.
 */
const page = { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] };

interface PrState {
  updatedAt: string;
  threadComments: number;
  state: string;
}

function pendingPr(state: PrState) {
  const comments = Array.from({ length: state.threadComments }, (_, index) => ({
    id: `PRRC_${index}`,
    body: `comment ${index}`,
    url: `https://github.com/octocat/hello-world/pull/101#discussion_r${index + 1}`,
    author: { login: "reviewer" },
    createdAt: "2026-10-09T00:00:00Z",
    updatedAt: "2026-10-09T00:00:00Z",
  }));
  return makeRawPr({
    number: 101,
    state: state.state,
    updatedAt: state.updatedAt,
    headRefOid: "aaa111",
    baseRef: { rules: { pageInfo: { hasNextPage: false }, nodes: [] } },
    reviewThreads:
      state.threadComments === 0
        ? page
        : {
            ...page,
            nodes: [
              {
                id: "PRRT_1",
                isResolved: true,
                isOutdated: false,
                path: "src/index.mts",
                line: 5,
                comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: comments },
              },
            ],
          },
    commits: {
      totalCount: 1,
      nodes: [
        {
          commit: {
            oid: "aaa111",
            committedDate: "2026-10-09T00:00:00Z",
            statusCheckRollup: {
              state: "PENDING",
              contexts: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    __typename: "CheckRun",
                    id: "CR_1",
                    name: "ci",
                    status: "IN_PROGRESS",
                    conclusion: null,
                  },
                ],
              },
            },
            checkSuites: {
              pageInfo: { hasNextPage: false },
              nodes: [{ id: "CS_1", status: "IN_PROGRESS", conclusion: null, workflowRun: null }],
            },
          },
        },
      ],
    },
  });
}

async function servePr(state: PrState) {
  await serve((request, response) => {
    if (request.path === "/graphql") {
      response.end(JSON.stringify(makeResponse(pendingPr(state), "me")));
    } else response.end("[]");
  });
}

const tick = (fingerprintCache: boolean) =>
  runWithGithubTransport("graphql", () =>
    runIterate({
      prNumber: 101,
      targetRepository: repo,
      format: "json",
      readyDelaySeconds: 0,
      stallTimeoutSeconds: 0,
      noAutoMarkReady: true,
      fingerprintCache,
    }),
  );

function operations(): string[] {
  return wire.requests.map((request) =>
    request.path === "/graphql"
      ? (String(request.body.query).match(/\b(?:query|mutation)\s+(\w+)/)?.[1] ?? "graphql")
      : `${request.method} ${request.path.split("?")[0]}`,
  );
}

async function measure(fingerprintCache: boolean) {
  wire.requests.length = 0;
  const report = await tick(fingerprintCache);
  return { report, operations: operations() };
}

describe("GraphQL wait tick cost", () => {
  it("spends one BatchPr request per wait tick, reused or not", async () => {
    await freshLoadConfig();
    const state = { updatedAt: "2026-10-09T00:00:00Z", threadComments: 0, state: "OPEN" };
    await servePr(state);
    const cold = await measure(false);
    expect(cold.report.action).toBe("wait");
    expect(cold.operations).toEqual(["BatchPr"]);
    for (let i = 0; i < 2; i++) {
      const warm = await measure(true);
      expect(warm.report).toMatchObject({ action: "wait", fingerprintReused: true });
      expect(warm.operations).toEqual(["BatchPr"]);
    }
    // A changed first page continues the same request instead of paying for a second read.
    state.updatedAt = "2026-10-09T00:01:00Z";
    const changed = await measure(true);
    expect(changed.report.action).toBe("wait");
    expect(changed.report).not.toHaveProperty("fingerprintReused");
    expect(changed.operations).toEqual(["BatchPr"]);
    // A returned tick never reuses and still costs the one request.
    const returned = await measure(false);
    expect(returned.report).not.toHaveProperty("fingerprintReused");
    expect(returned.operations).toEqual(["BatchPr"]);
  });

  it("does not reuse a report whose thread has comments the fingerprint cannot see", async () => {
    await freshLoadConfig();
    await servePr({ updatedAt: "2026-10-09T00:00:00Z", threadComments: 2, state: "OPEN" });
    // The first look surfaces the resolved thread once; after that the PR is only waiting.
    expect((await measure(false)).report.action).toBe("fix_code");
    expect((await measure(false)).report.action).toBe("wait");
    const next = await measure(true);
    expect(next.report.action).toBe("wait");
    expect(next.report).not.toHaveProperty("fingerprintReused");
    expect(next.operations).toEqual(["BatchPr"]);
  });

  it("reads a PR that merged since the last wait tick with one BatchPr request", async () => {
    await freshLoadConfig();
    const state = { updatedAt: "2026-10-09T00:00:00Z", threadComments: 0, state: "OPEN" };
    await servePr(state);
    expect((await measure(false)).report.action).toBe("wait");
    Object.assign(state, { state: "MERGED", updatedAt: "2026-10-09T00:02:00Z" });
    const merged = await measure(true);
    expect(merged.report.action).toBe("cancel");
    expect(merged.operations).toEqual(["BatchPr"]);
  });
});
