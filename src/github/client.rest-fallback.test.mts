import { describe, expect, it } from "vitest";
import {
  serve,
  wire,
  repo,
  prefix,
  pull,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { getPrNumberForBranch, getPullRequestBody } from "./client.mts";
import { runWithGithubTransport } from "./transport.mts";
import { runJournal } from "../commands/journal/index.mts";
import { resolveRestIdentity } from "./rest-identities.mts";

describe("REST branch inference", () => {
  it("finds a fork branch without assuming the base repository owner owns the head", async () => {
    await serve((request, response) => {
      const url = new URL(request.path, "https://api.github.com");
      const matches = url.searchParams.get("head") === null;
      response.end(
        JSON.stringify(
          matches
            ? [{ ...pull, head: { ref: "feature", repo: { full_name: "contributor/fork" } } }]
            : [],
        ),
      );
    });
    await expect(
      runWithGithubTransport("rest", () => getPrNumberForBranch("feature", repo.owner, repo.name)),
    ).resolves.toBe(101);
    expect(wire.requests[0]?.path).toBe(`${prefix}/pulls?state=open&per_page=100`);
  });

  it("matches the branch ref after following the next page instead of selecting an unrelated pull", async () => {
    await serve((request, response) => {
      const url = new URL(request.path, "https://api.github.com");
      if (!url.searchParams.has("page")) {
        response.setHeader(
          "link",
          `<https://api.github.com${prefix}/pulls?state=open&per_page=100&page=2>; rel="next"`,
        );
        response.end(JSON.stringify([{ number: 99, head: { ref: "unrelated" } }]));
      } else response.end(JSON.stringify([{ number: 101, head: { ref: "feature/with space" } }]));
    });
    await expect(
      runWithGithubTransport("rest", () =>
        getPrNumberForBranch("feature/with space", repo.owner, repo.name),
      ),
    ).resolves.toBe(101);
    expect(wire.requests).toHaveLength(2);
  });

  it("returns null when open pulls do not match the branch", async () => {
    await serve((_request, response) =>
      response.end(JSON.stringify([{ number: 99, head: { ref: "unrelated" } }])),
    );
    await expect(
      runWithGithubTransport("rest", () => getPrNumberForBranch("feature", repo.owner, repo.name)),
    ).resolves.toBeNull();
  });
});

describe("journal after a successful GraphQL body read", () => {
  const fullDatabaseId = "9007199254740993";
  it("rejects a rounded numeric identity instead of persisting a different pull ID", async () => {
    await serve((_request, response) =>
      response.end(
        JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                id: pull.node_id,
                fullDatabaseId: Number(fullDatabaseId),
                body: "Summary",
              },
            },
          },
        }),
      ),
    );
    await expect(
      runWithGithubTransport("graphql", () => getPullRequestBody(101, repo.owner, repo.name)),
    ).rejects.toThrow("fullDatabaseId");
    await expect(resolveRestIdentity(pull.node_id, "pull")).rejects.toThrow(
      "No recorded REST identity",
    );
  });
  async function serveJournalMutation(
    status: number,
    payload: unknown,
    headers: Record<string, string> = {},
  ) {
    await serve((request, response) => {
      if (request.path === "/graphql" && String(request.body.query).includes("query GetPrBody")) {
        response.end(
          JSON.stringify({
            data: {
              repository: {
                pullRequest: {
                  id: pull.node_id,
                  fullDatabaseId,
                  body: "## Summary\n\nKeep this description.",
                },
              },
            },
          }),
        );
      } else if (request.path === "/graphql") {
        response.statusCode = status;
        for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
        response.end(JSON.stringify(payload));
      } else if (request.path === "/rate_limit")
        response.end(JSON.stringify({ resources: { graphql: { remaining: 0 } } }));
      else if (request.method === "PATCH" && request.path === `${prefix}/pulls/101`)
        response.end(JSON.stringify({ body: request.body.body }));
      else {
        response.statusCode = 404;
        response.end(JSON.stringify({ message: "Unexpected request" }));
      }
    });
  }

  const journal = () =>
    runJournal({
      prNumber: 101,
      targetRepository: repo,
      rawItem: "- Preserve the decision.",
      dryRun: false,
    });

  it("persists pull identity and patches the journal after headerless GraphQL quota exhaustion is proven", async () => {
    await serveJournalMutation(200, {
      data: null,
      errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }],
    });
    await expect(runWithGithubTransport("auto", journal)).resolves.toMatchObject({
      prNumber: 101,
      mutated: true,
    });
    expect(await resolveRestIdentity(pull.node_id, "pull")).toMatchObject({
      repo,
      pr: 101,
      numericId: fullDatabaseId,
    });
    expect(wire.requests.map(({ method, path }) => [method, path])).toEqual([
      ["POST", "/graphql"],
      ["POST", "/graphql"],
      ["GET", "/rate_limit"],
      ["PATCH", `${prefix}/pulls/101`],
    ]);
    const patchBody = wire.requests.at(-1)?.body.body;
    expect(patchBody).toContain("## Summary\n\nKeep this description.");
    expect(patchBody).toContain("<summary>Shepherd Journal</summary>");
    expect(patchBody).toContain("- Preserve the decision.");
  });

  it.each([
    [401, { message: "Bad credentials" }, {}],
    [403, { message: "Resource not accessible by integration" }, {}],
    [
      200,
      {
        data: null,
        errors: [{ type: "FORBIDDEN", message: "Resource not accessible by integration" }],
      },
      {},
    ],
    [403, { message: "You have exceeded a secondary rate limit" }, { "retry-after": "3" }],
  ])(
    "does not replay a journal mutation for non-primary rejection %#",
    async (status, payload, headers) => {
      await serveJournalMutation(status, payload, headers);
      await expect(runWithGithubTransport("auto", journal)).rejects.toThrow();
      expect(wire.requests.length).toBeGreaterThanOrEqual(2);
      expect(
        wire.requests.every(({ method, path }) => method === "POST" && path === "/graphql"),
      ).toBe(true);
    },
  );
});
