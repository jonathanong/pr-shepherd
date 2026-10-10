import { describe, expect, it, vi } from "vitest";
import { serve, wire, prefix, repo } from "../test-helpers/github/rest-read.test-support.mts";
import { restIterateRoutes } from "../test-helpers/github/rest-iterate-routes.test-support.mts";
import { runPoll } from "../src/commands/poll.mts";
import { runWithGithubTransport } from "../src/github/transport.mts";
import { sleep } from "../src/util/sleep.mts";

vi.mock("../src/util/sleep.mts", () => ({ sleep: vi.fn(async () => {}) }));

describe("REST branch-policy throttling after automatic GraphQL fallback", () => {
  it.each([
    { endpoint: "/branches/main/protection", kind: "primary" },
    { endpoint: "/branches/main/protection", kind: "secondary" },
    { endpoint: "/branches/main/protection", kind: "retry-after" },
    { endpoint: "/rules/branches/main", kind: "primary" },
    { endpoint: "/rules/branches/main", kind: "secondary" },
    { endpoint: "/rules/branches/main", kind: "retry-after" },
  ])("backs off and resumes complete reads for $endpoint $kind", async ({ endpoint, kind }) => {
    let throttled = false;
    const fallback = restIterateRoutes({ quotaHeaders: true });
    const progress = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.mocked(sleep).mockClear();
    await serve((request, response) => {
      if (!throttled && request.path.split("?")[0] === `${prefix}${endpoint}`) {
        throttled = true;
        response.statusCode = 403;
        if (kind === "primary") {
          response.setHeader("x-ratelimit-resource", "core");
          response.setHeader("x-ratelimit-remaining", "0");
          response.setHeader("x-ratelimit-limit", "5000");
          response.setHeader("x-ratelimit-reset", String(Math.ceil(Date.now() / 1000) + 2));
        } else if (kind === "retry-after") response.setHeader("retry-after", "120");
        response.end(
          JSON.stringify({
            message:
              kind === "primary"
                ? "API rate limit exceeded"
                : kind === "secondary"
                  ? "You have exceeded a secondary rate limit"
                  : "Please retry later",
          }),
        );
      } else if (request.path.split("?")[0]?.endsWith("/protection")) {
        response.statusCode = 404;
        response.end('{"message":"Branch not protected"}');
      } else void fallback(request, response);
    });
    const result = await runWithGithubTransport("auto", () =>
      runPoll({
        prNumber: 101,
        targetRepository: repo,
        format: "json",
        readyDelaySeconds: 0,
        stallTimeoutSeconds: 0,
        intervalSeconds: 0,
        timeoutSeconds: 0,
        debounceSeconds: 0,
        untilTerminal: true,
        noAutoMarkReady: true,
      }),
    );
    expect(result).toMatchObject({ action: "cancel", status: "READY", transport: "rest" });
    expect(wire.requests.filter(({ path }) => path === "/graphql")).toHaveLength(1);
    expect(wire.requests.filter(({ path }) => path === "/rate_limit")).toHaveLength(0);
    expect(
      wire.requests.filter(({ path }) => path.split("?")[0] === `${prefix}${endpoint}`).length,
    ).toBeGreaterThanOrEqual(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sleep).mock.calls[0]?.[0]).toBeGreaterThan(0);
    if (kind === "retry-after") expect(sleep).toHaveBeenCalledWith(120_000);
    expect(progress.mock.calls.flat().join("")).toContain(
      kind === "primary" ? "GitHub REST core rate limit" : "GitHub secondary rate limit",
    );
    expect(wire.requests.filter(({ method }) => method !== "GET")).toMatchObject([
      { method: "POST", path: "/graphql" },
    ]);
    progress.mockRestore();
  });
});
