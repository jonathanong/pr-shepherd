import { describe, expect, it } from "vitest";
import {
  wire,
  serve,
  repo,
  prefix,
  pull,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { makeRawPr, makeResponse } from "../../test-helpers/github/batch-fixtures.mts";
import { runWithGithubTransport, getGithubTransport } from "./transport.mts";
import { fetchPrBatch } from "./batch.mts";

describe("full snapshot REST fallback", () => {
  it("restarts the full batch after a nested GraphQL thread page is refused", async () => {
    const partial = makeRawPr({
      number: 101,
      headRefOid: "stale-head",
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "PRRT_partial",
            isResolved: false,
            isOutdated: false,
            comments: { pageInfo: { hasNextPage: true, endCursor: "next-page" }, nodes: [] },
          },
        ],
      },
    });
    let graphReads = 0;
    await serve((request, response) => {
      const path = request.path.split("?")[0];
      if (path === "/graphql") {
        if (++graphReads === 1) response.end(JSON.stringify(makeResponse(partial)));
        else {
          response.statusCode = 403;
          response.end(
            JSON.stringify({
              message:
                "GitHub GraphQL is not available from Claude Code sessions; use the REST API",
            }),
          );
        }
      } else if (path === `${prefix}/pulls/101`) response.end(JSON.stringify(pull));
      else if (path === prefix)
        response.end(
          '{"allow_merge_commit":true,"allow_squash_merge":true,"allow_rebase_merge":false}',
        );
      else if (path?.endsWith("protection")) {
        response.statusCode = 403;
        response.end('{"message":"Resource not accessible by integration"}');
      } else if (path?.endsWith("check-runs")) response.end('{"total_count":0,"check_runs":[]}');
      else if (path?.endsWith("check-suites")) response.end('{"total_count":0,"check_suites":[]}');
      else if (path?.endsWith("actions/runs")) response.end('{"total_count":0,"workflow_runs":[]}');
      else response.end("[]");
    });
    await runWithGithubTransport("auto", async () => {
      const result = await fetchPrBatch(101, repo);
      expect(result.data).toMatchObject({
        transport: "rest",
        headRefOid: "aaa111",
        reviewThreads: [],
      });
      expect(result.data).not.toHaveProperty("viewerAuthorization");
      expect(getGithubTransport()).toBe("rest");
    });
    expect(wire.requests.filter((request) => request.path === "/graphql")).toHaveLength(2);
  });
});
