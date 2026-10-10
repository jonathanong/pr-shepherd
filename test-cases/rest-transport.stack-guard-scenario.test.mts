import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { serve, wire, pull, prefix, repo } from "../test-helpers/github/rest-read.test-support.mts";
import { createPrShepherd } from "../src/api.mts";
import { createPrShepherdMcpServer } from "../src/mcp/server.mts";
import { claimMergeRequest, readMergeRequest } from "../src/state/merge-request.mts";

const pr = "octocat/hello-world#101";
const requireSha = "a".repeat(40);
const expectedStack = {
  number: 42,
  baseRefName: "main",
  prefix: [{ pr: 101, headRefName: "user-model", headRefOid: requireSha, baseRefName: "main" }],
};
const operation = {
  type: "merge" as const,
  requireSha,
  mergeAction: "merge_queue" as const,
  expectedStack,
};
const uuid = "630b9d5e-3f2a-4f7e-8b0c-2d5f9a8c1e42";
const pending = {
  status: "pending" as const,
  details: {
    uuid,
    expected_head_sha: requireSha,
    merge_action: "merge_queue" as const,
    bypass_rules: false,
  },
};
const key = { owner: repo.owner, repo: repo.name, pr: 101 };

async function missingStackRoutes() {
  await serve((request, response) => {
    if (request.path === `${prefix}/pulls/101`)
      response.end(JSON.stringify({ ...pull, head: { ...pull.head, sha: requireSha } }));
    else if (request.path.startsWith(`${prefix}/stacks?`)) response.end("[]");
    else if (request.path === `${prefix}/pulls/101/merge-async/${uuid}`)
      response.end(JSON.stringify(pending));
    else {
      response.statusCode = 404;
      response.end(JSON.stringify({ message: `Unexpected guarded-merge route ${request.path}` }));
    }
  });
}

async function withMcp(run: (client: Client) => Promise<void>) {
  const server = createPrShepherdMcpServer({ transport: "rest" });
  const client = new Client({ name: "stack-guard-scenario", version: "1" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

function assertReadOnly() {
  expect(wire.requests.every(({ method }) => method === "GET")).toBe(true);
  expect(wire.requests.some(({ path }) => path === "/graphql")).toBe(false);
}

async function persistPending() {
  await claimMergeRequest(key, {
    version: 1,
    options: { requireSha, mergeAction: "merge_queue", expectedStack },
    startedAtUnix: 1,
    uuid,
    response: pending,
  });
}

describe("REST stack guards survive library and MCP operation boundaries", () => {
  it("validates the guard's PR before an earlier journal operation can write", async () => {
    await missingStackRoutes();
    const mismatched = {
      ...operation,
      expectedStack: { ...expectedStack, prefix: [{ ...expectedStack.prefix[0]!, pr: 102 }] },
    };
    await expect(
      createPrShepherd({ transport: "rest" }).apply({
        pr,
        operations: [
          { type: "append_journal", item: "- Keep this journal untouched." },
          mismatched,
        ],
      }),
    ).rejects.toThrow("expectedStack prefix must end at the requested PR");
    expect(wire.requests).toEqual([]);
  });

  it("rejects a disappeared stack before library submission", async () => {
    await missingStackRoutes();
    const shepherd = createPrShepherd({ transport: "rest" });
    await expect(shepherd.apply({ pr, operations: [operation] })).rejects.toThrow(
      "Expected native stack is no longer present",
    );
    expect(await readMergeRequest(key)).toBeNull();
    assertReadOnly();
  });

  it("preserves the same guard through MCP and reports the rejected request", async () => {
    await missingStackRoutes();
    await withMcp(async (client) => {
      const result = await client.callTool({
        name: "apply",
        arguments: { pr, operations: [operation] },
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain(
        "Expected native stack is no longer present",
      );
    });
    expect(await readMergeRequest(key)).toBeNull();
    assertReadOnly();
  });

  it("resumes a guarded pending UUID without a second submission after membership disappears", async () => {
    await missingStackRoutes();
    await persistPending();
    const result = await createPrShepherd({ transport: "rest" }).apply({
      pr,
      operations: [operation],
    });
    expect(result.operations[0]).toMatchObject({
      type: "merge",
      result: { pr: 101, repo: "octocat/hello-world", ...pending },
    });
    expect((await readMergeRequest(key))?.options.expectedStack).toEqual(expectedStack);
    expect(wire.requests.filter(({ path }) => path.includes("/merge-async/"))).toHaveLength(1);
    assertReadOnly();
  });

  it("returns the same pending outcome in MCP structured and Markdown content", async () => {
    await missingStackRoutes();
    await persistPending();
    await withMcp(async (client) => {
      const result = await client.callTool({
        name: "apply",
        arguments: { pr, operations: [operation] },
      });
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        operations: [
          { type: "merge", result: { pr: 101, repo: "octocat/hello-world", ...pending } },
        ],
      });
      expect(result.content).toEqual([
        {
          type: "text",
          text: [
            "## Operation 1: merge",
            "",
            "PR: octocat/hello-world#101",
            "status: pending",
            `- uuid: ${uuid}`,
            `- expected_head_sha: ${requireSha}`,
            "- merge_action: merge_queue",
            "- bypass_rules: false",
          ].join("\n"),
        },
      ]);
    });
    expect(wire.requests.filter(({ path }) => path.includes("/merge-async/"))).toHaveLength(1);
    assertReadOnly();
  });

  it.each(["dropped", "changed"])("refuses a %s guard on a pending MCP request", async (change) => {
    await missingStackRoutes();
    await persistPending();
    const modified = {
      type: operation.type,
      requireSha,
      mergeAction: operation.mergeAction,
      ...(change === "changed" && {
        expectedStack: { ...expectedStack, baseRefName: "other-trunk" },
      }),
    };
    await withMcp(async (client) => {
      const result = await client.callTool({
        name: "apply",
        arguments: { pr, operations: [modified] },
      });
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        operations: [{ type: "merge", result: { status: "failed", uncertain: true } }],
      });
      expect(JSON.stringify(result.content)).toContain("different options");
    });
    expect((await readMergeRequest(key))?.options.expectedStack).toEqual(expectedStack);
    expect(wire.requests.filter(({ path }) => path.includes("/merge-async/"))).toHaveLength(0);
    assertReadOnly();
  });
});
