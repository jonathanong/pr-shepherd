import { describe, expect, it } from "vitest";
import {
  wire,
  serve,
  repo,
  comment as restComment,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { readReplyRecoveryEvidence } from "./reply-recovery-read.mts";
import { runWithGithubTransport } from "./transport.mts";

const id = "PRRT_one";
const comment = (value: string) => ({
  id: value,
  databaseId: value === "one" ? 11 : 12,
  body: `body ${value}`,
  author: { login: "agent" },
});
const node = (overrides: Record<string, unknown> = {}) => ({
  id,
  pullRequest: { number: 101, repository: { nameWithOwner: "octocat/hello-world" } },
  comments: {
    totalCount: 1,
    pageInfo: { hasNextPage: false, endCursor: null },
    nodes: [comment("one")],
  },
  ...overrides,
});
const read = () =>
  runWithGithubTransport("graphql", () => readReplyRecoveryEvidence(repo, 101, [id]));

describe("bounded reply recovery evidence", () => {
  it("completes all comment pages before permitting outcome reconciliation", async () => {
    await serve((request, response) => {
      const cursor = (request.body.variables as { cursor: string | null }).cursor;
      response.end(
        JSON.stringify({
          data: {
            viewer: { login: "agent" },
            nodes: [
              node({
                comments: {
                  totalCount: 2,
                  pageInfo: { hasNextPage: !cursor, endCursor: cursor ? null : "older" },
                  nodes: [comment(cursor ? "two" : "one")],
                },
              }),
            ],
          },
        }),
      );
    });
    expect((await read()).get(id)).toEqual({
      viewer: "agent",
      comments: [
        { id: "one", body: "body one", author: "agent" },
        { id: "two", body: "body two", author: "agent" },
      ],
    });
    expect(wire.requests).toHaveLength(2);
    expect(wire.requests.every(({ path }) => path === "/graphql")).toBe(true);
  });

  it.each([
    [
      "wrong PR",
      node({ pullRequest: { number: 102, repository: { nameWithOwner: "octocat/hello-world" } } }),
    ],
    [
      "wrong repository",
      node({ pullRequest: { number: 101, repository: { nameWithOwner: "other/repo" } } }),
    ],
    [
      "missing completion flag",
      node({ comments: { totalCount: 1, pageInfo: {}, nodes: [comment("one")] } }),
    ],
    [
      "missing comment ID",
      node({
        comments: {
          totalCount: 1,
          pageInfo: { hasNextPage: false },
          nodes: [{ body: "one", author: null }],
        },
      }),
    ],
    [
      "missing cursor",
      node({
        comments: {
          totalCount: 2,
          pageInfo: { hasNextPage: true, endCursor: null },
          nodes: [comment("one")],
        },
      }),
    ],
    [
      "count mismatch",
      node({
        comments: { totalCount: 2, pageInfo: { hasNextPage: false }, nodes: [comment("one")] },
      }),
    ],
  ])("rejects %s evidence", async (_name, candidate) => {
    await serve((_request, response) =>
      response.end(JSON.stringify({ data: { viewer: { login: "agent" }, nodes: [candidate] } })),
    );
    await expect(read()).rejects.toThrow("Reply recovery");
    expect(wire.requests).toHaveLength(1);
  });

  it.each(["duplicate ID", "changed viewer", "changed count", "repeated cursor"])(
    "rejects %s during pagination",
    async (kind) => {
      let calls = 0;
      await serve((_request, response) => {
        const second = ++calls > 1;
        response.end(
          JSON.stringify({
            data: {
              viewer: { login: second && kind === "changed viewer" ? "other" : "agent" },
              nodes: [
                node({
                  comments: {
                    totalCount: second && kind === "changed count" ? 3 : 2,
                    pageInfo: {
                      hasNextPage: !second || kind === "repeated cursor",
                      endCursor: "same",
                    },
                    nodes: [comment(second && kind !== "duplicate ID" ? "two" : "one")],
                  },
                }),
              ],
            },
          }),
        );
      });
      await expect(read()).rejects.toThrow("Reply recovery");
      expect(wire.requests).toHaveLength(2);
    },
  );

  it("never reads GitHub for empty or oversized batches", async () => {
    await serve((_request, response) => response.end("{}"));
    expect(await readReplyRecoveryEvidence(repo, 101, [])).toEqual(new Map());
    await expect(
      readReplyRecoveryEvidence(
        repo,
        101,
        Array.from({ length: 11 }, (_, index) => `id-${index}`),
      ),
    ).rejects.toThrow("exceeds 10");
    expect(wire.requests).toHaveLength(0);
  });

  it("rejects missing GraphQL viewer identity", async () => {
    await serve((_request, response) =>
      response.end(JSON.stringify({ data: { viewer: {}, nodes: [node()] } })),
    );
    await expect(read()).rejects.toThrow("viewer is unavailable");
  });

  it.each(["missing viewer", "missing root", "malformed comment"])(
    "keeps REST %s evidence unavailable",
    async (kind) => {
      await serve((request, response) =>
        response.end(
          JSON.stringify(
            request.path === "/user"
              ? kind === "missing viewer"
                ? { login: 42 }
                : { login: "agent" }
              : kind === "missing root"
                ? []
                : [{ ...restComment(11), body: 42 }],
          ),
        ),
      );
      await expect(
        runWithGithubTransport("rest", () =>
          readReplyRecoveryEvidence(repo, 101, ["rest-thread-11"]),
        ),
      ).rejects.toThrow("Reply recovery");
    },
  );
});
