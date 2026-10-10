import { describe, expect, it } from "vitest";
import { serve, repo, wire, pull } from "../../test-helpers/github/rest-read.test-support.mts";
import { makeRawPr, makeResponse } from "../../test-helpers/github/batch-fixtures.mts";
import { freshLoadConfig } from "../../test-helpers/config/load-test-support.mts";
import { runIterate } from "../commands/iterate/index.mts";
import { runWithGithubTransport } from "./transport.mts";

/**
 * A head whose required check never reported pays one BaseBehind compare. The count depends only
 * on the base tip and the head commit, so a repeat tick with both unchanged answers from cache.
 */
const page = { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] };
const HEAD = "a".repeat(40);

interface State {
  baseTip: string;
  behindBy: number;
}

function blockedPr(state: State) {
  return makeRawPr({
    number: 101,
    updatedAt: "2026-10-09T00:00:00Z",
    mergeable: "MERGEABLE",
    mergeStateStatus: "BLOCKED",
    headRefOid: HEAD,
    baseRef: {
      target: { oid: state.baseTip },
      branchProtectionRule: null,
      rules: {
        pageInfo: { hasNextPage: false },
        nodes: [
          {
            type: "REQUIRED_STATUS_CHECKS",
            parameters: { requiredStatusChecks: [{ context: "backend" }] },
          },
        ],
      },
    },
    reviewThreads: page,
    commits: {
      totalCount: 1,
      nodes: [
        {
          commit: {
            oid: HEAD,
            committedDate: "2026-10-09T00:00:00Z",
            statusCheckRollup: {
              state: "PENDING",
              contexts: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    __typename: "CheckRun",
                    id: "CR_1",
                    name: "lint",
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

async function servePr(state: State) {
  await serve((request, response) => {
    if (request.path === "/graphql") {
      const query = String(request.body.query);
      if (/query\s+BaseBehind\b/.test(query)) {
        response.end(
          JSON.stringify({
            data: {
              repository: {
                ref: { target: { oid: state.baseTip }, compare: { behindBy: state.behindBy } },
              },
            },
          }),
        );
      } else response.end(JSON.stringify(makeResponse(blockedPr(state), "me")));
    } else if (request.path === "/repos/octocat/hello-world/pulls/101") {
      response.end(JSON.stringify({ ...pull, mergeable: true, mergeable_state: "blocked" }));
    } else response.end("[]");
  });
}

async function measure(fingerprintCache: boolean) {
  wire.requests.length = 0;
  const report = await runWithGithubTransport("graphql", () =>
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
  const operations = wire.requests
    .filter((request) => request.path === "/graphql")
    .map((request) => String(request.body.query).match(/\bquery\s+(\w+)/)?.[1]);
  return { report, operations };
}

describe("GraphQL BaseBehind tick cost", () => {
  it("reads the base compare once per base tip and head", async () => {
    await freshLoadConfig();
    const state = { baseTip: "b".repeat(40), behindBy: 3 };
    await servePr(state);

    const cold = await measure(false);
    expect(cold.operations).toEqual(["BatchPr", "BaseBehind"]);

    const returned = await measure(false);
    expect(returned.operations).toEqual(["BatchPr"]);

    const hit = await measure(true);
    expect(hit.report).toMatchObject({ fingerprintReused: true });
    expect(hit.operations).toEqual(["BatchPr"]);

    // The base moves: the fingerprint still matches, the compare does not.
    Object.assign(state, { baseTip: "c".repeat(40), behindBy: 4 });
    const moved = await measure(true);
    expect(moved.report).toMatchObject({ fingerprintReused: true });
    expect(moved.operations).toEqual(["BatchPr", "BaseBehind"]);
    expect(JSON.stringify(moved.report)).toContain('"baseBehindBy":4');
  });
});
