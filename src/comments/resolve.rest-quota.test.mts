import { describe, expect, it, vi } from "vitest";
import { wire, serve, repo } from "../../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { applyResolveOptions } from "./resolve.mts";

describe("successful REST mutation exhaustion", () => {
  it("preserves a successful reply and stops before resolving when its response exhausts core", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve((request, response) => {
      response.setHeader("x-ratelimit-resource", "core");
      response.setHeader("x-ratelimit-remaining", request.method === "POST" ? "0" : "1000");
      response.setHeader("x-ratelimit-limit", "5000");
      response.setHeader("x-ratelimit-reset", "9999999999");
      response.end(
        request.path === "/user"
          ? '{"login":"octocat"}'
          : request.method === "POST"
            ? '{"id":14}'
            : "[]",
      );
    });
    const result = await runWithGithubTransport("rest", () =>
      applyResolveOptions(101, repo, {
        replyThreadIds: ["rest-thread-11", "rest-thread-12"],
        resolveThreadIds: ["rest-thread-11"],
        dismissMessage: "Fixed in the current head",
      }),
    );
    expect(result.repliedThreads).toEqual(["rest-thread-11"]);
    expect(result.unrepliedThreads).toEqual(["rest-thread-12"]);
    expect(result.unresolvedThreads).toEqual(["rest-thread-11"]);
    expect(result.rateLimit).toMatchObject({ resource: "core", remaining: 0 });
    expect(wire.requests.filter(({ method }) => method === "POST")).toMatchObject([
      { path: "/repos/octocat/hello-world/pulls/101/comments/11/replies" },
    ]);
    expect(wire.requests).toHaveLength(3);
  });
  it("stops after a success exhausts core quota and reports every remaining ID", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve((_request, response) => {
      response.setHeader("x-ratelimit-resource", "core");
      response.setHeader("x-ratelimit-remaining", "0");
      response.setHeader("x-ratelimit-limit", "5000");
      response.setHeader("x-ratelimit-reset", "9999999999");
      response.end('{"resolved":true}');
    });
    const result = await runWithGithubTransport("rest", () =>
      applyResolveOptions(101, repo, {
        resolveThreadIds: ["rest-thread-11", "rest-thread-12", "rest-thread-13"],
      }),
    );
    expect(result.resolvedThreads).toEqual(["rest-thread-11"]);
    expect(result.unresolvedThreads).toEqual(["rest-thread-12", "rest-thread-13"]);
    expect(result.rateLimit).toMatchObject({ resource: "core", remaining: 0 });
    expect(result.rateLimit?.message).toContain("REST core");
    expect(wire.requests).toHaveLength(1);
  });
});
