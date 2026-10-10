import { describe, expect, it } from "vitest";
import { wire, serve, repo, comment } from "../../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { recordThreadIdentity } from "../github/rest-identities.mts";
import { applyResolveOptions } from "./resolve.mts";

describe("ambiguous reply safety across adapters", () => {
  it("does not replay an ambiguous GraphQL write through REST and blocks the aliased reply after restart", async () => {
    await recordThreadIdentity(repo, 101, "PRRT_opaque", 11);
    await serve((request, response) => {
      if (
        request.path === "/graphql" &&
        String(request.body.query).includes("ReplyRecoveryEvidence")
      )
        response.end(
          JSON.stringify({
            data: {
              viewer: { login: "agent" },
              nodes: [
                {
                  id: "PRRT_opaque",
                  pullRequest: {
                    number: 101,
                    repository: { nameWithOwner: "octocat/hello-world" },
                  },
                  comments: {
                    totalCount: 1,
                    pageInfo: { hasNextPage: false, endCursor: null },
                    nodes: [
                      {
                        id: "PRRC_11",
                        databaseId: 11,
                        body: "root",
                        author: { login: "reviewer" },
                      },
                    ],
                  },
                },
              ],
            },
          }),
        );
      else if (request.path === "/graphql") {
        response.statusCode = 503;
        response.end('{"message":"Service Unavailable"}');
      } else if (request.path === "/user") response.end('{"login":"agent"}');
      else response.end(JSON.stringify([comment(11)]));
    });
    const failed = await runWithGithubTransport("auto", () =>
      applyResolveOptions(101, repo, { replyThreadIds: ["PRRT_opaque"], dismissMessage: "Fixed." }),
    );
    expect(failed.repliedThreads).toEqual([]);
    expect(failed.unrepliedThreads).toEqual(["PRRT_opaque"]);
    expect(wire.requests).toHaveLength(2);
    await expect(
      runWithGithubTransport("rest", () =>
        applyResolveOptions(101, repo, {
          replyThreadIds: ["rest-thread-11"],
          dismissMessage: "Fixed.",
        }),
      ),
    ).rejects.toThrow("Previous GraphQL reply outcome is uncertain");
    expect(
      wire.requests.filter(({ body }) => String(body.query).includes("mutation BulkApply")),
    ).toHaveLength(1);
    expect(
      wire.requests.filter(({ method, path }) => method === "POST" && path !== "/graphql"),
    ).toHaveLength(0);
  });
});
