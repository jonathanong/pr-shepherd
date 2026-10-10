import { describe, expect, it, vi } from "vitest";
import { readFile, unlink } from "node:fs/promises";
import { wire, serve, repo, comment } from "../../test-helpers/github/rest-read.test-support.mts";
import { recordThreadIdentity } from "../github/rest-identities.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { applyResolveOptions } from "./resolve.mts";
import { addPrShepherdMarker } from "./marker.mts";
import { rememberUncertainReplies } from "./uncertain-replies.mts";
import { runResolveMutate } from "../commands/resolve-mutate.mts";
import { readSeenMarker, hashBody } from "../state/seen-comments.mts";
import { threadTranscriptBodies } from "../threads/transcript.mts";

const opaque = "PRRT_opaque";
const message = "Fixed.";
const body = addPrShepherdMarker(message);
const context = { repo, pr: 101 };
async function harness() {
  const fixture = {
    landed: false,
    visible: false,
    fail: true,
    actor: "agent",
    viewer: "agent",
    preexisting: false,
  };
  await serve((request, response) => {
    const comments = [
      comment(11),
      ...(fixture.preexisting
        ? [{ ...comment(12, 11), body, user: { login: "agent", type: "User" } }]
        : []),
      ...(fixture.landed && fixture.visible
        ? [{ ...comment(13, 11), body, user: { login: fixture.actor, type: "User" } }]
        : []),
    ];
    if (request.path === "/user") response.end(JSON.stringify({ login: fixture.viewer }));
    else if (request.path !== "/graphql") {
      if (request.method === "POST") response.end('{"resolved":true}');
      else response.end(JSON.stringify(comments));
    } else if (/ReplyRecoveryEvidence|ReplyThreadTranscripts/.test(String(request.body.query)))
      response.end(
        JSON.stringify({
          data: {
            viewer: { login: fixture.viewer },
            nodes: [
              {
                __typename: "PullRequestReviewThread",
                id: opaque,
                pullRequest: { number: 101, repository: { nameWithOwner: "octocat/hello-world" } },
                comments: {
                  totalCount: comments.length,
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: comments.map((item) => ({
                    id: item.node_id,
                    databaseId: item.id,
                    body: item.body,
                    author: { login: item.user.login },
                  })),
                },
              },
            ],
          },
        }),
      );
    else if (fixture.fail) {
      fixture.landed = true;
      response.statusCode = 503;
      response.end('{"message":"Service Unavailable"}');
    } else
      response.end(
        '{"data":{"p0":{"comment":{"id":"PRRC_14"}},"r0":{"thread":{"isResolved":true}}}}',
      );
  });
  return fixture;
}
const apply = (transport: "graphql" | "rest", id = opaque, text = message) =>
  runWithGithubTransport(transport, () =>
    applyResolveOptions(101, repo, {
      replyThreadIds: [id],
      resolveThreadIds: [id],
      dismissMessage: text,
    }),
  );
const mutations = () =>
  wire.requests.filter(({ body: request }) => String(request.query).includes("mutation BulkApply"));

describe("uncertain GraphQL reply recovery", () => {
  it("marks the actual transcript after command-level adoption without duplicating the reply body", async () => {
    const fixture = await harness();
    await apply("graphql");
    fixture.visible = true;
    fixture.fail = false;
    const result = await runWithGithubTransport("graphql", () =>
      runResolveMutate({
        prNumber: 101,
        targetRepository: repo,
        format: "json",
        replyThreadIds: [opaque],
        resolveThreadIds: [opaque],
        dismissMessage: message,
      }),
    );
    expect(result).toMatchObject({
      repliedThreads: [opaque],
      resolvedThreads: [opaque],
      errors: [],
    });
    expect(
      await readSeenMarker({ owner: repo.owner, repo: repo.name, pr: 101 }, opaque),
    ).toMatchObject({
      bodyHash: hashBody(threadTranscriptBodies([comment(11).body, body])),
    });
    expect(
      mutations().filter(({ body: request }) =>
        String(request.query).includes("addPullRequestReviewThreadReply"),
      ),
    ).toHaveLength(1);
  });

  it.each(["graphql", "rest"] as const)(
    "adopts a landed reply after restart through %s and resolves without replay",
    async (transport) => {
      const fixture = await harness();
      const first = await apply("graphql");
      expect(first).toMatchObject({ repliedThreads: [], unrepliedThreads: [opaque] });
      fixture.visible = true;
      fixture.fail = false;
      vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
      const id = transport === "rest" ? "rest-thread-11" : opaque;
      expect(await apply(transport, id)).toMatchObject({
        repliedThreads: [id],
        resolvedThreads: [id],
        errors: [],
      });
      expect(
        mutations().filter(({ body: request }) =>
          String(request.query).includes("addPullRequestReviewThreadReply"),
        ),
      ).toHaveLength(1);
      // A later retry must remain safe even if the caller did not receive the recovered result.
      expect(await apply(transport, id)).toMatchObject({
        repliedThreads: [id],
        resolvedThreads: [id],
      });
      expect(
        mutations().filter(({ body: request }) =>
          String(request.query).includes("addPullRequestReviewThreadReply"),
        ),
      ).toHaveLength(1);
    },
  );

  it.each(["absent", "historical", "wrong author", "different viewer"])(
    "does not adopt %s evidence",
    async (kind) => {
      const fixture = await harness();
      fixture.preexisting = kind === "historical";
      await apply("graphql");
      fixture.visible = kind !== "absent" && kind !== "historical";
      if (kind === "wrong author") fixture.actor = "someone-else";
      if (kind === "different viewer") fixture.viewer = "someone-else";
      await expect(apply("graphql")).rejects.toThrow(
        "verify whether the previous reply was delivered",
      );
      expect(mutations()).toHaveLength(1);
    },
  );

  it("permits a targeted caller-authorized clear for one legacy disposition while preserving another", async () => {
    const fixture = await harness();
    await recordThreadIdentity(repo, 101, opaque, 11);
    await rememberUncertainReplies(context, [opaque], message);
    await rememberUncertainReplies(context, [opaque], "Other disposition.");
    const error = await apply("graphql").catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    const paths = [...(error as Error).message.matchAll(/'([^']+\.json)'/g)].map(
      (match) => match[1]!,
    );
    expect(paths).toHaveLength(2);
    for (const path of paths) {
      expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ message });
      await unlink(path); // Represents explicit targeted state repair after verifying non-delivery.
    }
    fixture.fail = false;
    expect(await apply("graphql")).toMatchObject({
      repliedThreads: [opaque],
      resolvedThreads: [opaque],
      errors: [],
    });
    await expect(apply("graphql", opaque, "Other disposition.")).rejects.toThrow(
      "Previous GraphQL reply outcome is uncertain",
    );
    expect(mutations()).toHaveLength(1);
  });
});
