import { describe, expect, it, vi } from "vitest";
import { wire, serve } from "../../../test-helpers/github/rest-read.test-support.mts";
import { base, report } from "../../../test-helpers/github/mark-ready.test-support.mts";
import { runWithGithubTransport } from "../../github/transport.mts";
import { markReadyIfAuthorized } from "./mark-ready.mts";
import {
  recordApiTelemetry,
  summarizeApiTelemetry,
  withApiTelemetryScope,
} from "../../github/api-telemetry.mts";
import { formatIterateResult } from "../../cli/iterate-formatter.mts";
import { projectIterateLean } from "../../cli/iterate-lean.mts";

const markReady = (value = report) =>
  runWithGithubTransport("rest", () => markReadyIfAuthorized(true, base, value));
describe("REST mark-ready authorization", () => {
  it("attempts cloud ready-for-review with unknown capability and trusts draft:false", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve((_request, response) => response.end('{"draft":false}'));
    expect(await markReady()).toMatchObject({ action: "mark_ready", markedReady: true });
    expect(wire.requests).toMatchObject([
      { method: "POST", path: "/repos/octocat/hello-world/pulls/101/ccr/ready_for_review" },
    ]);
  });
  it("counts the headerless ready_for_review POST as unmetered, leaving core unchanged", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    // Live #566: the proxy answered 200 {"draft":false} with no X-RateLimit-* headers.
    await serve((_request, response) => response.end('{"draft":false}'));
    await withApiTelemetryScope(async () => {
      const core = { resource: "core", limit: 5000, remaining: 4990, used: 10, resetAt: 1 };
      recordApiTelemetry({ kind: "REST", method: "GET", authSource: "GH_TOKEN", rateLimit: core });
      const before = summarizeApiTelemetry();
      expect(await markReady()).toMatchObject({ action: "mark_ready", markedReady: true });
      const after = summarizeApiTelemetry();
      expect(after?.rest).toEqual(before?.rest);
      expect(after?.unmeteredRestRequestCount).toBe((before?.unmeteredRestRequestCount ?? 0) + 1);
    });
  });
  it("reports the confirmed conversion as no longer a draft in JSON and text", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve((_request, response) => response.end('{"draft":false}'));
    const result = (await markReady())!;
    expect(result).toMatchObject({ action: "mark_ready", markedReady: true, isDraft: false });
    expect(projectIterateLean(result)).not.toHaveProperty("isDraft");
    expect(formatIterateResult(result)).not.toContain("**isDraft**");
    expect(formatIterateResult(result, { verbose: true })).toContain("**isDraft** false");
  });
  it("escalates a definite server403 once as authorization-required", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve((_request, response) => {
      response.statusCode = 403;
      response.end('{"message":"Resource not accessible by integration"}');
    });
    expect(await markReady()).toMatchObject({
      action: "escalate",
      escalate: { triggers: ["authorization-required"] },
    });
    expect(wire.requests).toHaveLength(1);
  });
  it("escalates standard REST without fabricating cloud capability", async () => {
    await serve((_request, response) => response.end("{}"));
    expect(await markReady()).toMatchObject({
      action: "escalate",
      escalate: { triggers: ["transport-unsupported"] },
    });
    expect(wire.requests).toEqual([]);
  });
  it("surfaces a proxy session refusal separately from GitHub authorization", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    const message =
      'GitHub access to this repository is not enabled for this session. Call add_repo again with access:"push".';
    await serve((_request, response) => {
      response.statusCode = 403;
      response.end(JSON.stringify({ message }));
    });
    const result = await markReady();
    expect(result).toMatchObject({
      action: "escalate",
      escalate: {
        triggers: ["transport-unsupported"],
        suggestion: expect.stringContaining(message.replaceAll('"', '\\"')),
      },
    });
    expect(wire.requests).toHaveLength(1);
  });
  it("reports unsupported standard REST even with a known update capability", async () => {
    await serve((_request, response) => response.end("{}"));
    expect(
      await markReady({
        ...report,
        viewerAuthorization: {
          viewerCanUpdate: true,
          repositoryPermission: "WRITE",
          headRepositoryPermission: "WRITE",
        },
      }),
    ).toMatchObject({
      action: "escalate",
      escalate: { triggers: ["transport-unsupported"] },
    });
    expect(wire.requests).toEqual([]);
  });
  it("escalates when exhausted GraphQL falls back to standard REST for a ready mutation", async () => {
    await serve((_request, response) => {
      response.statusCode = 403;
      response.setHeader("x-ratelimit-resource", "graphql");
      response.setHeader("x-ratelimit-remaining", "0");
      response.setHeader("x-ratelimit-limit", "5000");
      response.setHeader("x-ratelimit-reset", "9999999999");
      response.end('{"message":"API rate limit exceeded"}');
    });
    const result = await runWithGithubTransport("auto", () =>
      markReadyIfAuthorized(true, base, {
        ...report,
        viewerAuthorization: {
          viewerCanUpdate: true,
          repositoryPermission: "WRITE",
          headRepositoryPermission: "WRITE",
        },
      }),
    );
    expect(result).toMatchObject({
      action: "escalate",
      escalate: { triggers: ["transport-unsupported"] },
    });
    expect(wire.requests).toMatchObject([{ method: "POST", path: "/graphql" }]);
  });
  it("does not mark a reused READY snapshot and propagates malformed acknowledgement", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve((_request, response) => response.end('{"draft":true}'));
    expect(await markReady({ ...report, fingerprintReused: true })).toMatchObject({
      action: "mark_ready",
      markedReady: false,
      isDraft: true,
    });
    expect(wire.requests).toEqual([]);
    await expect(markReady()).rejects.toThrow("did not confirm draft:false");
    expect(wire.requests).toHaveLength(1);
  });
});
