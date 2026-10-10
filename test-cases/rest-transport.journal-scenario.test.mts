import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { serve, wire, pull, prefix } from "../test-helpers/github/rest-read.test-support.mts";
import { createPrShepherd } from "../src/api.mts";
import { createPrShepherdMcpServer } from "../src/mcp/server.mts";

const pr = "octocat/hello-world#101";
const item = "- Retained the journal when GraphQL quota ran out during its write.";
const operations = [
  { type: "append_journal" as const, item },
  { type: "append_journal" as const, item },
];
const expected = {
  operations: [
    {
      type: "append_journal",
      result: { prNumber: 101, mutated: true, sectionExisted: false, dryRun: false },
    },
    {
      type: "append_journal",
      result: { prNumber: 101, mutated: false, sectionExisted: true, dryRun: false },
    },
  ],
};

async function journalRoutes(quotaHeaders: boolean) {
  let body = pull.body;
  await serve((request, response) => {
    if (request.path === "/graphql") {
      const query = String(request.body["query"]);
      if (query.includes("query GetPrBody")) {
        response.end(
          JSON.stringify({
            data: {
              repository: {
                pullRequest: { id: pull.node_id, fullDatabaseId: String(pull.id), body },
              },
            },
          }),
        );
      } else {
        response.statusCode = 403;
        if (quotaHeaders) {
          response.setHeader("x-ratelimit-resource", "graphql");
          response.setHeader("x-ratelimit-limit", "5000");
          response.setHeader("x-ratelimit-remaining", "0");
          response.setHeader("x-ratelimit-reset", "2000000000");
        }
        response.end(JSON.stringify({ message: "API rate limit exceeded" }));
      }
    } else if (request.path === "/rate_limit") {
      response.end(JSON.stringify({ resources: { graphql: { remaining: 0 } } }));
    } else if (request.path === `${prefix}/pulls/101`) {
      if (request.method === "PATCH") body = String(request.body["body"]);
      response.end(JSON.stringify({ ...pull, body }));
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ message: `Unexpected journal route ${request.path}` }));
    }
  });
}

function assertSingleWrite(quotaHeaders: boolean) {
  expect(wire.requests.filter(({ path }) => path === "/graphql")).toHaveLength(2);
  expect(wire.requests.filter(({ path }) => path === "/rate_limit")).toHaveLength(
    quotaHeaders ? 0 : 1,
  );
  const patches = wire.requests.filter(({ method }) => method === "PATCH");
  expect(patches).toHaveLength(1);
  expect(patches[0]).toMatchObject({
    path: `${prefix}/pulls/101`,
    body: {
      body: `${pull.body}\n\n<details>\n<summary>Shepherd Journal</summary>\n\n${item}\n</details>`,
    },
  });
}

describe("journal write falls back when its preceding GraphQL read consumed the quota", () => {
  it.each([true, false])(
    "completes ordered library operations and retains fallback (quota headers=%s)",
    async (quotaHeaders) => {
      await journalRoutes(quotaHeaders);
      const shepherd = createPrShepherd({ transport: "auto" });
      expect(await shepherd.apply({ pr, operations })).toEqual(expected);
      expect(await shepherd.getJournal({ pr })).toEqual({
        ok: true,
        journal: { format: "details", entries: [item] },
      });
      assertSingleWrite(quotaHeaders);
    },
  );

  it("completes the same MCP operations with equivalent structured and Markdown results", async () => {
    await journalRoutes(false);
    const server = createPrShepherdMcpServer({ transport: "auto" });
    const client = new Client({ name: "quota-journal-scenario", version: "1" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    try {
      const result = await client.callTool({ name: "apply", arguments: { pr, operations } });
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual(expected);
      expect(result.content).toEqual([
        {
          type: "text",
          text: "## Operation 1: append_journal\n\nCreated Shepherd Journal details in PR #101.\n\n## Operation 2: append_journal\n\nNo change — entry already present.",
        },
      ]);
      const journal = await client.callTool({ name: "get_journal", arguments: { pr } });
      expect(journal.structuredContent).toEqual({
        ok: true,
        journal: { format: "details", entries: [item] },
      });
      assertSingleWrite(false);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
