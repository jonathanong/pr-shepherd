import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { githubWire } from "../test-helpers/github/transport-wire.mts";
import { createPrShepherd } from "./api.mts";
import { createPrShepherdMcpServer } from "./mcp/server.mts";
import { _resetTokenCache } from "./github/http.mts";

let wire: Awaited<ReturnType<typeof githubWire>>;
const clients: Client[] = [];
const journalBody = (value: string) =>
  `<details>\n<summary>Shepherd Journal</summary>\n\n- ${value}\n</details>`;
const result = (value: string) => ({
  ok: true,
  journal: { format: "details", entries: [`- ${value}`] },
});
beforeAll(async () => {
  wire = await githubWire((request, response) => {
    if (request.path === "/graphql") {
      const variables = request.body["variables"] as { pr: number };
      if (variables.pr === 1) {
        response.statusCode = 403;
        response.end(
          JSON.stringify({ message: "GitHub GraphQL is not available from Claude Code sessions" }),
        );
      } else
        response.end(
          JSON.stringify({
            data: {
              repository: {
                pullRequest: { id: "PR_node", body: journalBody(`graphql ${variables.pr}`) },
              },
            },
          }),
        );
    } else {
      const number = Number(request.path.split("/").at(-1));
      response.end(
        JSON.stringify({
          node_id: "PR_node",
          id: number,
          number,
          body: journalBody(`rest ${number}`),
          title: "Transport test",
          html_url: `https://github.com/owner/repo/pull/${number}`,
          state: "open",
          merged_at: null,
          draft: false,
          mergeable: true,
          mergeable_state: "clean",
          updated_at: "2026-10-09T00:00:00Z",
          requested_reviewers: [],
          requested_teams: [],
          head: { ref: "topic", sha: "a".repeat(40), repo: null },
          base: { ref: "main", sha: "b".repeat(40) },
        }),
      );
    }
  });
});
afterAll(async () => wire.close());
beforeEach(() => {
  for (const name of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
    "NO_PROXY",
    "no_proxy",
    "CLAUDE_CODE_REMOTE",
  ])
    vi.stubEnv(name, "");
  vi.stubEnv("GH_TOKEN", "test-token");
  vi.stubEnv("PR_SHEPHERD_LOG_DISABLED", "1");
  vi.stubGlobal("fetch", wire.fetch);
  _resetTokenCache();
  wire.requests.length = 0;
});
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  _resetTokenCache();
});

async function mcp(transport: "auto" | "rest" | "graphql") {
  const server = createPrShepherdMcpServer({ transport });
  const client = new Client({ name: "transport-test", version: "1" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  clients.push(client);
  return client;
}

describe("library and MCP transport scopes", () => {
  it("retains a library client's auto fallback across calls without affecting another client", async () => {
    const client = createPrShepherd({ transport: "auto" });
    await expect(client.getJournal({ pr: "owner/repo#1" })).resolves.toEqual(result("rest 1"));
    await expect(client.getJournal({ pr: "owner/repo#2" })).resolves.toEqual(result("rest 2"));
    await expect(client.getJournal({ pr: "owner/repo#2", transport: "graphql" })).resolves.toEqual(
      result("graphql 2"),
    );
    await expect(
      createPrShepherd({ transport: "auto" }).getJournal({ pr: "owner/repo#3" }),
    ).resolves.toEqual(result("graphql 3"));
    expect(wire.requests.map((request) => request.path)).toEqual([
      "/graphql",
      "/repos/owner/repo/pulls/1",
      "/repos/owner/repo/pulls/2",
      "/graphql",
      "/graphql",
    ]);
  });

  it("isolates concurrent MCP overrides and retains the server's default mode", async () => {
    const client = await mcp("rest");
    const [graphql, rest] = await Promise.all([
      client.callTool({
        name: "get_journal",
        arguments: { pr: "owner/repo#2", transport: "graphql" },
      }),
      client.callTool({
        name: "get_journal",
        arguments: { pr: "owner/repo#3", transport: "rest" },
      }),
    ]);
    expect(graphql.structuredContent).toEqual(result("graphql 2"));
    expect(rest.structuredContent).toEqual(result("rest 3"));
    const defaultMode = await client.callTool({
      name: "get_journal",
      arguments: { pr: "owner/repo#4" },
    });
    expect(defaultMode.structuredContent).toEqual(result("rest 4"));
  });

  it("retains each MCP server's fallback across calls while isolating other servers", async () => {
    const first = await mcp("auto");
    const second = await mcp("auto");
    const fallback = await first.callTool({
      name: "get_journal",
      arguments: { pr: "owner/repo#1" },
    });
    expect(fallback.structuredContent).toEqual(result("rest 1"));
    const [latched, independent] = await Promise.all([
      first.callTool({ name: "get_journal", arguments: { pr: "owner/repo#2" } }),
      second.callTool({ name: "get_journal", arguments: { pr: "owner/repo#3" } }),
    ]);
    expect(latched.structuredContent).toEqual(result("rest 2"));
    expect(independent.structuredContent).toEqual(result("graphql 3"));
  });
});
