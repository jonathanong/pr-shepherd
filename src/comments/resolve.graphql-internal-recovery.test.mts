import { describe, expect, it } from "vitest";
import { wire, serve, repo, comment } from "../../test-helpers/github/rest-read.test-support.mts";
import { applyResolveOptions } from "./resolve.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { addPrShepherdMarker } from "./marker.mts";
const message = "Fixed.";
const ids = Array.from({ length: 11 }, (_, index) => `PRRT_${index + 11}`);
const mutations = () =>
  wire.requests.filter(({ body }) => String(body.query).includes("mutation BulkApply"));
const apply = (transport: "graphql" | "rest", replyThreadIds = ids) =>
  runWithGithubTransport(transport, () =>
    applyResolveOptions(101, repo, { replyThreadIds, dismissMessage: message }),
  );

async function harness(payload: string) {
  const state = { failed: false };
  await serve((request, response) => {
    if (request.path === "/user") return response.end('{"login":"agent"}');
    if (request.path !== "/graphql")
      return response.end(
        JSON.stringify([
          comment(11),
          { ...comment(1011, 11), body: addPrShepherdMarker(message), user: { login: "agent" } },
        ]),
      );
    if (String(request.body.query).includes("ReplyRecoveryEvidence")) {
      const requested = (request.body.variables as { ids: string[] }).ids;
      return response.end(
        JSON.stringify({
          data: {
            viewer: { login: "agent" },
            nodes: requested.map((id) => {
              const root = Number(id.split("_")[1]);
              const comments = [
                {
                  id: `PRRC_${root}`,
                  databaseId: root,
                  body: "root",
                  author: { login: "reviewer" },
                },
                ...(state.failed
                  ? [
                      {
                        id: `PRRC_${root + 1000}`,
                        databaseId: root + 1000,
                        body: addPrShepherdMarker(message),
                        author: { login: "agent" },
                      },
                    ]
                  : []),
              ];
              return {
                id,
                pullRequest: { number: 101, repository: { nameWithOwner: "octocat/hello-world" } },
                comments: {
                  totalCount: comments.length,
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: comments,
                },
              };
            }),
          },
        }),
      );
    }
    if (!state.failed) {
      state.failed = true;
      return response.end(payload);
    }
    return response.end('{"data":{"p0":{"comment":{"id":"new"}}}}');
  });
}

describe("HTTP 200 ambiguous GraphQL mutation outcomes", () => {
  it.each([
    ["null INTERNAL", '{"data":null,"errors":[{"message":"engine crash","type":"INTERNAL"}]}'],
    ["invalid JSON", "<html>upstream failed</html>"],
    ["malformed payload", '{"data":42}'],
    ["null without errors", '{"data":null}'],
    ["missing aliases", '{"data":{}}'],
    ["null alias", '{"data":{"p0":null}}'],
  ])(
    "persists %s intent, stops later batches, and adopts through REST without a preseeded identity",
    async (_, payload) => {
      await harness(payload);
      expect(await apply("graphql")).toMatchObject({ repliedThreads: [], unrepliedThreads: ids });
      expect(mutations()).toHaveLength(1);
      expect(await apply("rest", ["rest-thread-11"])).toMatchObject({
        repliedThreads: ["rest-thread-11"],
        errors: [],
      });
      expect(mutations()).toHaveLength(1);
      expect(
        wire.requests.filter(({ method, path }) => method === "POST" && path !== "/graphql"),
      ).toHaveLength(0);
      // The second mutation batch never ran and must remain eligible.
      expect(await apply("graphql", [ids[10]!])).toMatchObject({
        repliedThreads: [ids[10]!],
        errors: [],
      });
      expect(mutations()).toHaveLength(2);
    },
  );

  it.each(["alias", "root", "unpathed"])(
    "preserves confirmed aliases and adopts only unconfirmed replies after %s INTERNAL",
    async (kind) => {
      const error = {
        message: "engine crash",
        extensions: { code: "INTERNAL" },
        ...(kind === "alias"
          ? { path: ["p1", "comment"] }
          : kind === "root"
            ? { path: ["mutation"] }
            : {}),
      };
      await harness(
        JSON.stringify({
          data: { p0: { comment: { id: "confirmed" } }, p1: null },
          errors: [
            error,
            { message: "Reply validation failed", path: ["p2"], type: "UNPROCESSABLE" },
          ],
        }),
      );
      expect(await apply("graphql")).toMatchObject({
        repliedThreads: [ids[0]],
        unrepliedThreads: ids.slice(1),
      });
      expect(mutations()).toHaveLength(1);
      expect(await apply("graphql", [ids[1]!])).toMatchObject({
        repliedThreads: [ids[1]],
        errors: [],
      });
      expect(mutations()).toHaveLength(1);
      if (kind === "alias") {
        // The unrelated alias has an authoritative application refusal.
        expect(await apply("graphql", [ids[2]!])).toMatchObject({
          repliedThreads: [ids[2]],
          errors: [],
        });
        expect(mutations()).toHaveLength(2);
      }
    },
  );

  it("keeps a proven permission rejection eligible for a later explicitly directed attempt", async () => {
    await harness(
      '{"data":null,"errors":[{"message":"Resource not accessible by integration","type":"FORBIDDEN"}]}',
    );
    await apply("graphql", [ids[0]!]);
    expect(await apply("graphql", [ids[0]!])).toMatchObject({
      repliedThreads: [ids[0]],
      errors: [],
    });
    expect(mutations()).toHaveLength(2);
  });

  it.each([
    ["p0", ["p0"], 2],
    ["r0", ["r0"], 1],
    ["unknown", ["other"], 1],
    ["malformed", "p0", 1],
  ])(
    "attributes a thrown null-data refusal to %s without losing a potentially landed reply",
    async (alias, path, expectedMutations) => {
      await harness(
        JSON.stringify({
          data: null,
          errors: [
            {
              message: "Resource not accessible by integration",
              type: "FORBIDDEN",
              path,
            },
          ],
        }),
      );
      const first = await runWithGithubTransport("graphql", () =>
        applyResolveOptions(101, repo, {
          replyThreadIds: [ids[0]!],
          resolveThreadIds: [ids[0]!],
          dismissMessage: message,
        }),
      );
      expect(first).toMatchObject({
        repliedThreads: [],
        resolvedThreads: [],
      });
      if (alias !== "p0")
        expect(first).toMatchObject({ unrepliedThreads: [ids[0]], unresolvedThreads: [ids[0]] });
      expect(mutations()).toHaveLength(1);
      expect(await apply("graphql", [ids[0]!])).toMatchObject({
        repliedThreads: [ids[0]],
        errors: [],
      });
      expect(mutations()).toHaveLength(expectedMutations);
    },
  );
});
