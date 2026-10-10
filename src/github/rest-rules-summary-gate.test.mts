import { describe, expect, it } from "vitest";
import { serve, repo, wire } from "../../test-helpers/github/rest-read.test-support.mts";
import { readRestBranchRules } from "./rest-rules-read.mts";

describe("REST branch summary gate", () => {
  it("skips the charged protection read when the branch summary reports classic protection disabled", async () => {
    await serve((request, response) => {
      const path = request.path.split("?")[0]!;
      if (path.endsWith("/hello-world/branches/main"))
        response.end('{"name":"main","protected":true,"protection":{"enabled":false}}');
      else response.end("[]");
    });
    const result = await readRestBranchRules(repo, "main");
    expect(result.unavailable).toEqual([]);
    expect(result.baseRef?.branchProtectionRule).toBeNull();
    expect(wire.requests.some((r) => r.path.includes("/protection"))).toBe(false);
  });

  it.each([
    ['{"protection":{"enabled":true}}', 200],
    ['{"protection":null}', 200],
    ["[]", 200],
    ['{"message":"Not Found"}', 404],
  ])("falls through to the protection endpoint for summary %s (HTTP %i)", async (body, status) => {
    await serve((request, response) => {
      const path = request.path.split("?")[0]!;
      if (path.endsWith("/hello-world/branches/main")) {
        response.statusCode = status;
        response.end(body);
      } else response.end(path.endsWith("/protection") ? "{}" : "[]");
    });
    const result = await readRestBranchRules(repo, "main");
    expect(result.baseRef?.branchProtectionRule).not.toBeNull();
    expect(wire.requests.some((r) => r.path.endsWith("/protection"))).toBe(true);
  });

  it("propagates a rate-limited branch summary", async () => {
    await serve((_request, response) => {
      response.statusCode = 403;
      response.setHeader("x-ratelimit-remaining", "0");
      response.setHeader("x-ratelimit-limit", "5000");
      response.setHeader("x-ratelimit-reset", "2000000000");
      response.end('{"message":"API rate limit exceeded"}');
    });
    await expect(readRestBranchRules(repo, "main")).rejects.toMatchObject({ status: 403 });
  });
});
