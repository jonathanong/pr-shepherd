import { describe, expect, it } from "vitest";
import { wire, serve, repo, prefix } from "../../../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "../../github/transport.mts";
import { writeCheckBlocker, readCheckBlockers } from "../../state/check-blockers.mts";
import { resolveCheckBlockerGate } from "./check-blocker-gate.mts";

const key = { owner: repo.owner, repo: repo.name, pr: 101 };
async function blocked(checkName: string, number: number, kind: "pull" | "issue") {
  expect(
    await writeCheckBlocker(key, {
      checkName,
      recordedAt: 1,
      blocker: { owner: repo.owner, name: repo.name, number, kind },
    }),
  ).toBe(true);
}
describe("REST check blockers", () => {
  it("reads raw issue/pull state, deduplicates shared blockers and releases merged dependencies", async () => {
    await blocked("build", 10, "issue");
    await blocked("unit", 10, "issue");
    await blocked("integration", 20, "pull");
    await serve((request, response) => {
      if (request.path === `${prefix}/issues/10`) response.end('{"state":"open"}');
      else if (request.path === `${prefix}/pulls/20`)
        response.end('{"state":"closed","merged":true}');
      else {
        response.statusCode = 404;
        response.end("{}");
      }
    });
    const result = await runWithGithubTransport("rest", () =>
      resolveCheckBlockerGate(
        key,
        [{ name: "build" }, { name: "unit" }, { name: "integration" }],
        "BEHIND",
      ),
    );
    expect([...result!.deferredNames]).toEqual(["build", "unit"]);
    expect([...result!.releasedNames]).toEqual(["integration"]);
    expect(result!.openBlockers).toEqual(["octocat/hello-world#10"]);
    expect(wire.requests).toHaveLength(2);
    expect(
      wire.requests.every((request) => request.method === "GET" && request.path !== "/graphql"),
    ).toBe(true);
  });
  it("clears a closed dependency once the branch is already current", async () => {
    await blocked("integration", 20, "pull");
    await serve((_request, response) => response.end('{"state":"closed","merged":false}'));
    const result = await runWithGithubTransport("rest", () =>
      resolveCheckBlockerGate(key, [{ name: "integration" }], "CLEAN"),
    );
    expect(result).toBeNull();
    expect(await readCheckBlockers(key)).toEqual([]);
  });
  it("propagates a core throttle and preserves the dependency record", async () => {
    await blocked("build", 10, "issue");
    await serve((_request, response) => {
      response.statusCode = 403;
      response.setHeader("x-ratelimit-resource", "core");
      response.setHeader("x-ratelimit-remaining", "0");
      response.setHeader("x-ratelimit-limit", "5000");
      response.setHeader("x-ratelimit-reset", "9999999999");
      response.end('{"message":"API rate limit exceeded"}');
    });
    await expect(
      runWithGithubTransport("rest", () => resolveCheckBlockerGate(key, [{ name: "build" }])),
    ).rejects.toMatchObject({ rateLimit: { resource: "core", remaining: 0 } });
    expect(await readCheckBlockers(key)).toMatchObject([{ checkName: "build" }]);
  });
});
