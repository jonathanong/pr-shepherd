import { describe, expect, it } from "vitest";
import { serve, repo, wire } from "../../test-helpers/github/rest-read.test-support.mts";
import { readRestBranchRules } from "./rest-rules-read.mts";
import { GitHubRequestError } from "./errors.mts";
import { rateLimitKind } from "./rate-limit-kind.mts";
import { isRestSessionRefusal } from "./rest-session-refusal.mts";
import { EXIT } from "../exit-codes.mts";

const primaryHeaders = {
  "x-ratelimit-remaining": "0",
  "x-ratelimit-limit": "5000",
  "x-ratelimit-reset": "2000000000",
  "x-ratelimit-resource": "core",
};
const throttles: Array<{
  name: string;
  message: string;
  headers: Record<string, string>;
  kind: "primary" | "secondary";
  retryAfterSeconds?: number;
}> = [
  {
    name: "primary exhaustion",
    message: "API rate limit exceeded",
    headers: primaryHeaders,
    kind: "primary",
  },
  {
    name: "headerless secondary limit",
    message: "You have exceeded a secondary rate limit",
    headers: {},
    kind: "secondary",
  },
  {
    name: "secondary limit with quota remaining",
    message: "You have exceeded a secondary rate limit",
    headers: { ...primaryHeaders, "x-ratelimit-remaining": "17" },
    kind: "secondary",
  },
  {
    name: "Retry-After throttle",
    message: "Resource not accessible by integration",
    headers: { "retry-after": "23" },
    kind: "secondary",
    retryAfterSeconds: 23,
  },
];

async function serveFailure(endpoint: string, body: string, headers: Record<string, string> = {}) {
  await serve((request, response) => {
    // A branch summary without `protection` falls through to the authoritative endpoint.
    const protection = request.path.includes("/protection");
    if (request.path.split("?")[0]!.endsWith("/hello-world/branches/main")) {
      response.end("{}");
    } else if (protection === (endpoint === "protection")) {
      response.statusCode = 403;
      for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
      response.end(body);
    } else response.end(protection ? "{}" : "[]");
  });
}

async function readError() {
  const error: unknown = await readRestBranchRules(repo, "main").then(
    () => null,
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(GitHubRequestError);
  if (!(error instanceof GitHubRequestError))
    throw new Error("Expected branch policy request error");
  return error;
}

describe.each(["protection", "rules"])("REST %s policy failure propagation", (endpoint) => {
  it.each(throttles)("preserves $name for retry/backoff", async (fixture) => {
    const body = JSON.stringify({ message: fixture.message });
    await serveFailure(endpoint, body, fixture.headers);
    const error = await readError();
    expect(error).toMatchObject({ status: 403, exitCode: EXIT.TEMPFAIL, responseMessage: body });
    expect(rateLimitKind(error)).toBe(fixture.kind);
    expect(error.retryAfterSeconds).toBe(fixture.retryAfterSeconds);
    if (fixture.headers["x-ratelimit-remaining"] !== undefined)
      expect(error.rateLimit).toMatchObject({
        remaining: Number(fixture.headers["x-ratelimit-remaining"]),
        resource: "core",
        resetAt: 2000000000,
      });
    expect(wire.requests).toHaveLength(endpoint === "protection" ? 2 : 3);
  });

  it.each([
    {
      name: "session message",
      body: JSON.stringify({ message: "REST API is not enabled for this session" }),
    },
    {
      name: "proxy documentation after long message",
      body: JSON.stringify({
        message: "x".repeat(1500),
        documentation_url: "https://docs.anthropic.com/en/docs/claude-code",
      }),
    },
  ])("preserves cloud refusal identified by $name", async ({ body }) => {
    await serveFailure(endpoint, body);
    const error = await readError();
    expect(error).toMatchObject({ status: 403, responseMessage: body });
    expect(isRestSessionRefusal(error)).toBe(true);
    expect(rateLimitKind(error)).toBeNull();
    expect(wire.requests).toHaveLength(endpoint === "protection" ? 2 : 3);
  });

  it("keeps ordinary permission denial as an explicit policy gap", async () => {
    await serveFailure(endpoint, '{"message":"Resource not accessible by integration"}');
    expect(await readRestBranchRules(repo, "main")).toMatchObject({
      unavailable: [{ field: endpoint === "protection" ? "branchProtection" : "branchRules" }],
    });
    expect(wire.requests).toHaveLength(3);
  });
});
