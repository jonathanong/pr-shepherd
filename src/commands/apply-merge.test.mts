/* eslint-disable max-lines */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeWire, mergeHead, mergeUuid } from "../../test-helpers/github/merge-wire.mts";
import { createPrShepherd } from "../api.mts";
import { main } from "../cli-parser.mts";
import { createPrShepherdMcpServer } from "../mcp/server.mts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { runWithGithubTransport } from "../github/transport.mts";
import { _resetTokenCache } from "../github/http.mts";
import { _resetLogState } from "../log/log-file.mts";
import { readMergeRequest } from "../state/merge-request.mts";
import { runApplyMerge } from "./apply-merge.mts";
import { formatApplyMergeResult } from "../cli/apply-merge-handler.mts";

let harness: Awaited<ReturnType<typeof mergeWire>>;
let directory: string;
const input = {
  prNumber: 1,
  targetRepository: { owner: "owner", name: "repo" },
  requireSha: mergeHead,
  mergeAction: "direct_merge" as const,
  mergeMethod: "squash" as const,
};
const apply = () => runWithGithubTransport("rest", () => runApplyMerge(input));
const submissions = () => harness.wire.requests.filter((request) => request.method === "PUT");
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "pr-shepherd-merge-test-"));
  harness = await mergeWire();
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
  vi.stubEnv("PR_SHEPHERD_STATE_DIR", directory);
  vi.stubGlobal("fetch", harness.wire.fetch);
  _resetTokenCache();
  _resetLogState();
});
afterEach(async () => {
  await harness.wire.close();
  await rm(directory, { recursive: true, force: true });
  process.exitCode = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  _resetTokenCache();
});

describe("guarded asynchronous REST merge", () => {
  it("submits guarded options, persists its UUID, and resumes without resubmission", async () => {
    const first = await apply();
    expect(first).toMatchObject({
      status: "pending",
      details: {
        uuid: mergeUuid,
        expected_head_sha: mergeHead,
        merge_action: "direct_merge",
        merge_method: "squash",
      },
    });
    expect(submissions()).toHaveLength(1);
    expect(submissions()[0]?.body).toEqual({
      sha: mergeHead,
      merge_action: "direct_merge",
      merge_method: "squash",
      bypass_rules: false,
    });
    expect(await readMergeRequest({ owner: "owner", repo: "repo", pr: 1 })).toMatchObject({
      uuid: mergeUuid,
      options: { requireSha: mergeHead, mergeAction: "direct_merge", mergeMethod: "squash" },
    });
    harness.fixture.pollBody = {
      status: "enqueued",
      details: { message: "Added to merge queue." },
    };
    const second = await apply();
    expect(second.status).toBe("enqueued");
    expect(second.status).not.toBe("merged");
    expect(submissions()).toHaveLength(1);
    expect(
      harness.wire.requests.some((request) => request.path.endsWith(`/merge-async/${mergeUuid}`)),
    ).toBe(true);
    for (const [name, value] of Object.entries(first.details))
      expect(formatApplyMergeResult(first)).toContain(`${name}: ${String(value)}`);
  });

  it("adopts an existing 409 request only when every guarded option matches", async () => {
    harness.fixture.submitStatus = 409;
    await expect(apply()).resolves.toMatchObject({
      status: "pending",
      details: { uuid: mergeUuid },
    });
    harness.fixture.pollBody = { status: "merged", details: { sha: "b".repeat(40) } };
    await expect(apply()).resolves.toMatchObject({
      status: "merged",
      details: { sha: "b".repeat(40) },
    });
    expect(submissions()).toHaveLength(1);
  });

  it.each([
    { expected_head_sha: "b".repeat(40) },
    { merge_action: "merge_queue" },
    { merge_method: "rebase" },
    { bypass_rules: true },
    { uuid: "not-a-uuid" },
  ])("refuses mismatched 409 options %j without adopting or retrying", async (mismatch) => {
    harness.fixture.submitStatus = 409;
    Object.assign(harness.fixture.submitBody.details, mismatch);
    await expect(apply()).resolves.toMatchObject({ status: "failed", uncertain: true });
    await expect(apply()).resolves.toMatchObject({ status: "failed", uncertain: true });
    expect(submissions()).toHaveLength(1);
    expect((await readMergeRequest({ owner: "owner", repo: "repo", pr: 1 }))?.uuid).toBeUndefined();
    expect(harness.wire.requests.some((request) => request.path.includes("/merge-async/"))).toBe(
      false,
    );
  });

  it("refuses a stale SHA before mutating and never silently changes a persisted request", async () => {
    harness.fixture.snapshot.head.sha = "b".repeat(40);
    await expect(apply()).resolves.toMatchObject({ status: "failed" });
    expect(submissions()).toHaveLength(0);
    harness.fixture.snapshot.head.sha = mergeHead;
    await apply();
    await expect(
      runWithGithubTransport("rest", () => runApplyMerge({ ...input, mergeMethod: "rebase" })),
    ).resolves.toMatchObject({ status: "failed", uncertain: true });
    expect(submissions()).toHaveLength(1);
  });

  it("never duplicates a mutation after a socket failure, including a later invocation", async () => {
    harness.fixture.failMutation = true;
    await expect(apply()).resolves.toMatchObject({ status: "failed", uncertain: true });
    harness.fixture.failMutation = false;
    await expect(apply()).resolves.toMatchObject({ status: "failed", uncertain: true });
    expect(submissions()).toHaveLength(1);
  });

  it.each([503, 202])(
    "never duplicates a mutation after a server failure or malformed %s response",
    async (status) => {
      harness.fixture.submitStatus = status;
      if (status === 202)
        harness.fixture.submitBody = {
          status: "invalid",
          details: {},
        } as unknown as typeof harness.fixture.submitBody;
      await expect(apply()).resolves.toMatchObject({ status: "failed", uncertain: true });
      harness.fixture.submitStatus = 202;
      await expect(apply()).resolves.toMatchObject({ status: "failed", uncertain: true });
      expect(submissions()).toHaveLength(1);
    },
  );

  it("reconciles an expired UUID against actual merged state and leaves unknown outcomes blocked", async () => {
    await apply();
    harness.fixture.pollStatus = 404;
    await expect(apply()).resolves.toMatchObject({ status: "failed", uncertain: true });
    harness.fixture.mergedOnExpiry = true;
    await expect(apply()).resolves.toMatchObject({ status: "merged" });
    expect(submissions()).toHaveLength(1);
  });

  it("permits a new guarded head only after a definitive failure, with one successor submission", async () => {
    harness.fixture.submitStatus = 400;
    harness.fixture.submitBody = {
      status: "failed",
      details: { message: "Pull request is not ready." },
    };
    await expect(apply()).resolves.toMatchObject({ status: "failed" });
    const nextHead = "c".repeat(40);
    harness.fixture.snapshot.head.sha = nextHead;
    harness.fixture.submitStatus = 202;
    harness.fixture.submitBody = {
      status: "pending",
      details: {
        uuid: mergeUuid,
        expected_head_sha: nextHead,
        merge_action: "direct_merge",
        merge_method: "squash",
        bypass_rules: false,
      },
    };
    const next = () =>
      runWithGithubTransport("rest", () => runApplyMerge({ ...input, requireSha: nextHead }));
    const results = await Promise.all([next(), next()]);
    expect(results.some((result) => result.status === "pending")).toBe(true);
    expect(submissions()).toHaveLength(2);
    expect(submissions()[1]?.body["sha"]).toBe(nextHead);
  });

  it("keeps ambiguous previous submissions blocked even after the head changes", async () => {
    harness.fixture.failMutation = true;
    await expect(apply()).resolves.toMatchObject({ status: "failed", uncertain: true });
    harness.fixture.failMutation = false;
    const nextHead = "c".repeat(40);
    harness.fixture.snapshot.head.sha = nextHead;
    await expect(
      runWithGithubTransport("rest", () => runApplyMerge({ ...input, requireSha: nextHead })),
    ).resolves.toMatchObject({ status: "failed", uncertain: true });
    expect(submissions()).toHaveLength(1);
  });

  it("claims a single submission under concurrent commands", async () => {
    const results = await Promise.all([apply(), apply()]);
    expect(results.some((result) => result.status === "pending")).toBe(true);
    expect(submissions()).toHaveLength(1);
  });

  it("fails safely on malformed durable state before a new mutation", async () => {
    await apply();
    await writeFile(join(directory, "owner", "repo", "1", "merge-async.json"), "corrupt");
    await expect(apply()).rejects.toThrow();
    expect(submissions()).toHaveLength(1);
  });

  it("supports API apply merge and validates all later operations before the first mutation", async () => {
    const client = createPrShepherd({ transport: "rest" });
    const operation = {
      type: "merge" as const,
      requireSha: mergeHead,
      mergeAction: "direct_merge" as const,
      mergeMethod: "squash" as const,
    };
    await expect(
      client.apply({
        pr: "owner/repo#1",
        operations: [operation, { ...operation, requireSha: "invalid" }],
      }),
    ).rejects.toThrow("require-sha");
    expect(submissions()).toHaveLength(0);
    await expect(
      client.apply({ pr: "owner/repo#1", operations: [operation] }),
    ).resolves.toMatchObject({ operations: [{ type: "merge", result: { status: "pending" } }] });
  });

  it.each(["merge_queue", "default"] as const)(
    "submits %s without an unsupported merge method",
    async (mergeAction) => {
      harness.fixture.submitStatus = 200;
      harness.fixture.submitBody = {
        status: "enqueued",
        details: { message: "Already in the merge queue." },
      };
      await expect(
        runWithGithubTransport("rest", () =>
          runApplyMerge({ ...input, mergeAction, mergeMethod: undefined }),
        ),
      ).resolves.toMatchObject({ status: "enqueued" });
      expect(submissions()[0]?.body).toEqual({
        sha: mergeHead,
        merge_action: mergeAction,
        bypass_rules: false,
      });
    },
  );

  it("runs the qualified CLI apply merge command with global transport and JSON output", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await main([
      "node",
      "shepherd",
      "apply",
      "merge",
      "owner/repo#1",
      "--require-sha",
      mergeHead,
      "--merge-action",
      "direct_merge",
      "--method",
      "squash",
      "--transport",
      "rest",
      "--format=json",
    ]);
    expect(process.exitCode).toBe(10);
    const printed = stdout.mock.calls.map((call) => String(call[0])).join("");
    expect(JSON.parse(printed)).toMatchObject({
      status: "pending",
      details: { uuid: mergeUuid, expected_head_sha: mergeHead },
    });
    expect(submissions()).toHaveLength(1);
  });

  it("exposes merge through actual MCP apply and retains the same response details in Markdown", async () => {
    const server = createPrShepherdMcpServer({ transport: "rest" });
    const client = new Client({ name: "merge-test", version: "1" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    try {
      await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
      const result = await client.callTool({
        name: "apply",
        arguments: {
          pr: "owner/repo#1",
          transport: "rest",
          operations: [
            {
              type: "merge",
              requireSha: mergeHead,
              mergeAction: "direct_merge",
              mergeMethod: "squash",
            },
          ],
        },
      });
      expect(result.structuredContent).toMatchObject({
        operations: [
          {
            type: "merge",
            result: {
              status: "pending",
              details: {
                uuid: mergeUuid,
                expected_head_sha: mergeHead,
                merge_action: "direct_merge",
                merge_method: "squash",
                bypass_rules: false,
              },
            },
          },
        ],
      });
      const content = result.content as Array<{ type: string; text: string }>;
      const text = content.map((item) => item.text).join("\n");
      for (const value of [mergeUuid, mergeHead, "direct_merge", "squash", "bypass_rules: false"])
        expect(text).toContain(value);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("requires REST and rejects method options for queue/default before any HTTP request", async () => {
    await expect(runWithGithubTransport("graphql", () => runApplyMerge(input))).rejects.toThrow(
      "requires REST",
    );
    await expect(
      runWithGithubTransport("rest", () => runApplyMerge({ ...input, mergeAction: "merge_queue" })),
    ).rejects.toThrow("only with");
    await expect(
      runWithGithubTransport("rest", () => runApplyMerge({ ...input, mergeAction: "default" })),
    ).rejects.toThrow("only with");
    expect(harness.wire.requests).toHaveLength(0);
  });
});
