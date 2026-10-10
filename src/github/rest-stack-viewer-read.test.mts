import { describe, expect, it } from "vitest";
import { repo, wire } from "../../test-helpers/github/rest-read.test-support.mts";
import {
  certify,
  stackedServer,
  expectedStack,
  upperSha,
  mutations,
} from "../../test-helpers/github/rest-stack-merge-readiness.test-support.mts";
import { readRestStackTopology } from "./rest-stack-read.mts";
import { runWithGithubTransport } from "./transport.mts";
import { validateRestStackMergeReadiness } from "../commands/rest-stack-merge-readiness.mts";
import { runApplyMerge } from "../commands/apply-merge.mts";

describe("REST native topology with optional installation-token viewer", () => {
  it("retains complete ordered topology with unknown ownership when GET/user is unsupported", async () => {
    const fixture = await stackedServer();
    fixture.viewerStatus = 403;
    const topology = await readRestStackTopology(102, repo);
    expect(topology).toMatchObject({
      stackNumber: 42,
      stackSize: 2,
      viewerLogin: null,
      ordered: [{ number: 101 }, { number: 102 }],
    });
    expect(topology).not.toHaveProperty("viewerCanAdminister");
    expect(mutations()).toEqual([]);
  });

  it("validates receipt-bound guarded readiness read-only and then submits one merge without requiring user identity", async () => {
    const fixture = await stackedServer();
    fixture.viewerStatus = 403;
    await certify([101, 102]);
    await expect(
      runWithGithubTransport("rest", () =>
        validateRestStackMergeReadiness(102, repo, upperSha, expectedStack),
      ),
    ).resolves.toBeUndefined();
    expect(mutations()).toEqual([]);
    await expect(
      runWithGithubTransport("rest", () =>
        runApplyMerge({
          prNumber: 102,
          targetRepository: repo,
          requireSha: upperSha,
          mergeAction: "direct_merge",
          mergeMethod: "squash",
          expectedStack,
        }),
      ),
    ).resolves.toMatchObject({ status: "pending" });
    expect(mutations()).toHaveLength(1);
    expect(mutations()[0]).toMatchObject({
      method: "PUT",
      body: { sha: upperSha, bypass_rules: false },
    });
    expect(
      wire.requests.every(({ method, path }) => method === "GET" || path.endsWith("/merge-async")),
    ).toBe(true);
  });

  it("still rejects a missing lower READY receipt when user identity is unavailable", async () => {
    const fixture = await stackedServer();
    fixture.viewerStatus = 403;
    await certify([102]);
    await expect(
      runWithGithubTransport("rest", () =>
        validateRestStackMergeReadiness(102, repo, upperSha, expectedStack),
      ),
    ).rejects.toThrow("PR #101 has no current Shepherd READY receipt");
    expect(mutations()).toEqual([]);
  });

  it.each([
    { status: 403, message: "Endpoint is not enabled for this session", headers: {} },
    { status: 403, headers: { "retry-after": "3" } },
    {
      status: 403,
      headers: {
        "x-ratelimit-resource": "core",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-limit": "5000",
        "x-ratelimit-reset": "9999999999",
      },
    },
    { status: 503, headers: {} },
  ])(
    "propagates viewer temporary failures rather than allowing a topology read: %j",
    async ({ status, headers, message }) => {
      const fixture = await stackedServer();
      fixture.viewerStatus = status;
      fixture.viewerMessage = message ?? fixture.viewerMessage;
      fixture.viewerHeaders = headers as Record<string, string>;
      await expect(readRestStackTopology(102, repo)).rejects.toMatchObject({ status });
      expect(mutations()).toEqual([]);
    },
  );
});
