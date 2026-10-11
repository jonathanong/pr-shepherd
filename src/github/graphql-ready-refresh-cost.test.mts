import { describe, expect, it } from "vitest";
import {
  serve,
  repo,
  pull,
  prefix,
  serveWithEtags,
  etagResponses as log,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { makeRawPr, makeResponse } from "../../test-helpers/github/batch-fixtures.mts";
import { freshLoadConfig } from "../../test-helpers/config/load-test-support.mts";
import { runIterate } from "../commands/iterate/index.mts";
import { runWithGithubTransport } from "./transport.mts";

/**
 * The READY mergeability refresh on the GraphQL transport, measured at the HTTP boundary. The
 * refresh is a conditional pull read, so once one READY tick stored the pull's ETag a later
 * READY tick on an unchanged pull answers a free 304.
 */
const readyPr = (mergeStateStatus: string) =>
  makeRawPr({
    number: 101,
    mergeStateStatus,
    headRefOid: "aaa111",
    baseRef: { rules: { pageInfo: { hasNextPage: false }, nodes: [] } },
    commits: {
      totalCount: 1,
      nodes: [
        {
          commit: {
            oid: "aaa111",
            committedDate: "2026-10-09T00:00:00Z",
            statusCheckRollup: {
              state: "SUCCESS",
              contexts: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    __typename: "CheckRun",
                    id: "CR_1",
                    name: "ci",
                    status: "COMPLETED",
                    conclusion: "SUCCESS",
                  },
                ],
              },
            },
            checkSuites: {
              pageInfo: { hasNextPage: false },
              nodes: [
                { id: "CS_1", status: "COMPLETED", conclusion: "SUCCESS", workflowRun: null },
              ],
            },
          },
        },
      ],
    },
  });

async function serveReadyPr(live: { mergeableState: string }) {
  serveWithEtags();
  await serve((request, response) => {
    const path = request.path.split("?")[0]!;
    if (path === "/graphql") response.end(JSON.stringify(makeResponse(readyPr("CLEAN"), "me")));
    else if (path === `${prefix}/pulls/101`)
      response.end(JSON.stringify({ ...pull, mergeable_state: live.mergeableState }));
    else if (path.endsWith("/check-runs"))
      response.end(JSON.stringify({ total_count: 0, check_runs: [] }));
    else if (path.endsWith("/check-suites"))
      response.end(JSON.stringify({ total_count: 0, check_suites: [] }));
    else if (path === `${prefix}/branches/main`)
      response.end(JSON.stringify({ name: "main", commit: { sha: "bbb222" } }));
    else response.end("[]");
  });
}

const tick = () =>
  runWithGithubTransport("graphql", () =>
    runIterate({
      prNumber: 101,
      targetRepository: repo,
      format: "json",
      readyDelaySeconds: 600,
      stallTimeoutSeconds: 0,
      noAutoMarkReady: true,
    }),
  );

const pullReads = () =>
  log.filter((entry) => entry.path === `${prefix}/pulls/101`).map((entry) => entry.status);

describe("GraphQL READY mergeability refresh cost", () => {
  it("charges the first READY refresh and replays an unchanged pull for free", async () => {
    await freshLoadConfig();
    const live = { mergeableState: "clean" };
    await serveReadyPr(live);
    expect(await tick()).toMatchObject({ status: "READY" });
    expect(pullReads()).toEqual([200]);
    log.length = 0;
    expect(await tick()).toMatchObject({ status: "READY" });
    expect(pullReads()).toEqual([304]);
  });

  it("still reads a changed mergeability over REST", async () => {
    await freshLoadConfig();
    const live = { mergeableState: "clean" };
    await serveReadyPr(live);
    await tick();
    live.mergeableState = "dirty";
    log.length = 0;
    const next = await tick();
    expect(pullReads()).toEqual([200]);
    expect(next.action).not.toBe("wait");
  });
});
