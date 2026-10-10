import { wire, serve, repo, comment } from "../github/rest-read.test-support.mts";
import { runWithGithubTransport } from "../../src/github/transport.mts";
import { addPrShepherdMarker } from "../../src/comments/marker.mts";
import { runResolveMutate } from "../../src/commands/resolve-mutate.mts";

export const HEAD = "a".repeat(40);
export const message = "Fixed.";
export const key = { owner: repo.owner, repo: repo.name, pr: 101 };

export interface Fixture {
  head: string;
  /** Head returned by GetPrHeadSha, when it differs from the preflight's view. */
  polledHead?: string;
  failPreflight: boolean;
  failMutation: boolean;
  replied: boolean;
  /** Thread id -> comment count; more than 100 pages the comments connection. */
  threads: Record<string, number>;
}

function threadNode(id: string, count: number, cursor: string | null, replied: boolean) {
  const all = Array.from({ length: count }, (_, index) =>
    comment(index + 1, index ? 1 : undefined),
  );
  const bodies = [
    ...all,
    ...(replied
      ? [
          {
            ...comment(9999, 1),
            body: addPrShepherdMarker(message),
            user: { login: "agent", type: "User" },
          },
        ]
      : []),
  ];
  const start = cursor ? Number(cursor) : 0;
  const page = bodies.slice(start, start + 100);
  const hasNextPage = start + 100 < bodies.length;
  return {
    __typename: "PullRequestReviewThread",
    id,
    pullRequest: { number: 101, repository: { nameWithOwner: "octocat/hello-world" } },
    comments: {
      totalCount: bodies.length,
      pageInfo: { hasNextPage, endCursor: hasNextPage ? String(start + 100) : null },
      nodes: page.map((item) => ({
        id: item.node_id,
        databaseId: item.id,
        body: item.body,
        author: { login: item.user.login },
      })),
    },
  };
}

export async function harness(overrides: Partial<Fixture> = {}): Promise<Fixture> {
  const fixture: Fixture = {
    head: HEAD,
    failPreflight: false,
    failMutation: false,
    replied: false,
    threads: { PRRT_a: 1 },
    ...overrides,
  };
  await serve((request, response) => {
    const query = String(request.body.query);
    const variables = (request.body.variables ?? {}) as Record<string, unknown>;
    const name = query.match(/\b(?:query|mutation)\s+(\w+)/)?.[1];
    const nodes = (ids: unknown) =>
      (ids as string[]).map((id) =>
        id in fixture.threads
          ? threadNode(
              id,
              fixture.threads[id]!,
              (variables.cursor as string) ?? null,
              fixture.replied,
            )
          : null,
      );
    const send = (data: unknown) => response.end(JSON.stringify({ data }));
    if (name === "ApplyReviewPreflight") {
      if (fixture.failPreflight) {
        response.end('{"data":null,"errors":[{"message":"Something went wrong"}]}');
      } else
        send({
          repository: { pullRequest: { headRefOid: fixture.head } },
          viewer: { login: "agent" },
          nodes: nodes(variables.ids),
        });
    } else if (name === "GetPrHeadSha")
      send({ repository: { pullRequest: { headRefOid: fixture.polledHead ?? fixture.head } } });
    else if (name === "ReplyRecoveryEvidence" || name === "ReplyThreadTranscripts")
      send({ viewer: { login: "agent" }, nodes: nodes(variables.ids) });
    else if (name === "ReplyThreadComments")
      send({
        node: threadNode(
          variables.id as string,
          fixture.threads[variables.id as string]!,
          variables.cursor as string,
          fixture.replied,
        ),
      });
    else if (name === "BulkApply") {
      if (fixture.failMutation) {
        fixture.replied = true;
        response.statusCode = 503;
        response.end('{"message":"Service Unavailable"}');
      } else {
        const replies = [...query.matchAll(/p(\d+): addPullRequestReviewThreadReply/g)];
        send(Object.fromEntries(replies.map(([, i]) => [`p${i}`, { comment: { id: `C${i}` } }])));
      }
    } else response.end("[]");
  });
  return fixture;
}

export function applyReview(
  replyThreadIds: string[],
  requireSha?: string,
  adoptExistingReplies?: boolean,
) {
  return runWithGithubTransport("graphql", () =>
    runResolveMutate({
      prNumber: 101,
      targetRepository: repo,
      format: "json",
      replyThreadIds,
      dismissMessage: message,
      ...(requireSha && { requireSha }),
      ...(adoptExistingReplies && { adoptExistingReplies }),
    }),
  );
}

export function operations(): string[] {
  return wire.requests
    .filter((request) => request.path === "/graphql")
    .map((request) => String(request.body.query).match(/\b(?:query|mutation)\s+(\w+)/)?.[1] ?? "");
}

export { wire, comment };
