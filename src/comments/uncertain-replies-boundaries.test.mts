import { describe, expect, it } from "vitest";
import { wire, serve, repo, comment } from "../../test-helpers/github/rest-read.test-support.mts";
import { recordThreadIdentity } from "../github/rest-identities.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { applyResolveOptions } from "./resolve.mts";
import { addPrShepherdMarker } from "./marker.mts";
import { rememberUncertainReplies, assertReplyOutcomeKnown } from "./uncertain-replies.mts";
const opaque = "PRRT_opaque";
const message = "Fixed.";
const body = addPrShepherdMarker(message);
const context = { repo, pr: 101 };
const mutations = () =>
  wire.requests.filter(({ body: request }) => String(request.query).includes("mutation BulkApply"));
describe("uncertain reply transport and durable outcome boundaries", () => {
  it("routes the first write to REST when the prewrite read switches auto transport", async () => {
    await recordThreadIdentity(repo, 101, opaque, 11);
    await serve((request, response) => {
      if (request.path === "/graphql") {
        response.statusCode = 503;
        response.end('{"message":"Service Unavailable"}');
      } else if (request.path === "/user") response.end('{"login":"agent"}');
      else if (request.method === "POST") response.end('{"id":99}');
      else response.end(JSON.stringify([comment(11)]));
    });
    const result = await runWithGithubTransport("auto", () =>
      applyResolveOptions(101, repo, {
        replyThreadIds: [opaque],
        dismissMessage: message,
      }),
    );
    expect(result).toMatchObject({ repliedThreads: [opaque], errors: [] });
    expect(mutations()).toHaveLength(0);
    expect(wire.requests.filter(({ path }) => path === "/graphql")).toHaveLength(3);
    expect(
      wire.requests.filter(({ method, path }) => method === "POST" && path !== "/graphql"),
    ).toHaveLength(1);
  });

  it("keeps an adopted outcome durable when another uncertain reply prevents completing the retry", async () => {
    const second = "PRRT_other";
    const baseline = {
      viewer: "agent",
      comments: [{ id: "old", body: "root", author: "reviewer" }],
    };
    await rememberUncertainReplies(
      context,
      [opaque, second],
      message,
      new Map([
        [opaque, baseline],
        [second, baseline],
      ]),
    );
    await serve((request, response) => {
      const ids = (request.body.variables as { ids: string[] }).ids;
      response.end(
        JSON.stringify({
          data: {
            viewer: { login: "agent" },
            nodes: ids.map((id) => ({
              id,
              pullRequest: { number: 101, repository: { nameWithOwner: "octocat/hello-world" } },
              comments: {
                totalCount: id === opaque ? 2 : 1,
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    id: "old",
                    databaseId: id === opaque ? 11 : 22,
                    body: "root",
                    author: { login: "reviewer" },
                  },
                  ...(id === opaque ? [{ id: "landed", body, author: { login: "agent" } }] : []),
                ],
              },
            })),
          },
        }),
      );
    });
    await expect(
      runWithGithubTransport("graphql", () =>
        assertReplyOutcomeKnown(context, [opaque, second], message),
      ),
    ).rejects.toThrow("uncertain");
    const reads = wire.requests.length;
    expect(await assertReplyOutcomeKnown(context, [opaque], message)).toEqual([opaque]);
    expect(wire.requests).toHaveLength(reads);
  });
});
