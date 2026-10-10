import { describe, expect, it, vi } from "vitest";
import { wire, repo, prefix } from "../../test-helpers/github/rest-read.test-support.mts";
import { serveSummaryStack } from "../../test-helpers/github/rest-stack-summary.test-support.mts";
import { freshLoadConfig } from "../../test-helpers/config/load-test-support.mts";
import { fetchPollSummary } from "./poll-summary.mts";
import { readRestStackSummary } from "./rest-stack-summary.mts";
import { runWithGithubTransport } from "./transport.mts";
import { runIterate } from "../commands/iterate/index.mts";
import { withPollSummaryInstructions } from "../commands/poll-summary-instructions.mts";
import { EXIT } from "../exit-codes.mts";

const fetch = () =>
  runWithGithubTransport("rest", () => fetchPollSummary({ stackPrNumber: 101 }, repo));
const requestsFor = (path: string) =>
  wire.requests.filter((request) => request.path.split("?")[0] === path);

describe("REST stack evidence shared within one summary tick", () => {
  it.each([
    [false, 126],
    [true, 136],
  ] as const)(
    "keeps complete 10-layer snapshots within the HTTP request budget (cloud=%s)",
    async (cloud, requestCount) => {
      await freshLoadConfig();
      vi.stubEnv("CLAUDE_CODE_REMOTE", cloud ? "true" : "");
      await serveSummaryStack();
      const result = await fetch();
      expect(result.prs).toHaveLength(10);
      expect(
        result.prs.every((pr) => pr.owned && !pr.checks?.incomplete && !pr.review?.incomplete),
      ).toBe(true);
      expect(wire.requests).toHaveLength(requestCount);
      expect(requestsFor(prefix)).toHaveLength(1);
      expect(requestsFor("/user")).toHaveLength(1);
      expect(requestsFor(`${prefix}/stacks`)).toHaveLength(2);
      expect(requestsFor(`${prefix}/stacks/42`)).toHaveLength(2);
      for (const pr of result.prs) {
        expect(requestsFor(`${prefix}/pulls/${pr.pr}`)).toHaveLength(3);
        expect(requestsFor(`${prefix}/pulls/${pr.pr}/comments`)).toHaveLength(1);
        expect(requestsFor(`${prefix}/pulls/${pr.pr}/reviews`)).toHaveLength(1);
        expect(requestsFor(`${prefix}/issues/${pr.pr}/comments`)).toHaveLength(1);
      }
      expect(
        wire.requests.every(({ method, path }) => method === "GET" && path !== "/graphql"),
      ).toBe(true);
    },
  );

  it("uses real READY receipts and refreshes all shared evidence on the next tick", async () => {
    await freshLoadConfig();
    const fixture = await serveSummaryStack();
    for (const { number } of fixture.stack.pull_requests) {
      const ready = await runWithGithubTransport("rest", () =>
        runIterate({
          prNumber: number,
          targetRepository: repo,
          format: "json",
          readyDelaySeconds: 0,
          stallTimeoutSeconds: 0,
          noAutoMarkReady: true,
        }),
      );
      expect(ready).toMatchObject({ action: "cancel", status: "READY" });
    }
    wire.requests.length = 0;
    const first = await fetch();
    expect(
      first.prs.every((pr) => pr.readyReceipt && pr.owned && pr.requiresMergeQueue === false),
    ).toBe(true);
    const firstPlan = withPollSummaryInstructions(
      { ...first, mode: "summary", repo: "octocat/hello-world", reason: "actionable" },
      true,
    );
    expect(firstPlan.instructions?.join("\n")).toContain("--merge-action direct_merge");

    fixture.settings.allow_merge_commit = false;
    fixture.viewerLogin = "someone-else";
    fixture.rules.push({ type: "merge_queue", parameters: null });
    wire.requests.length = 0;
    const second = await fetch();
    expect(second.allowedMergeMethods).toEqual(["squash"]);
    expect(
      second.prs.every((pr) => pr.readyReceipt && !pr.owned && pr.requiresMergeQueue === true),
    ).toBe(true);
    expect(wire.requests).toHaveLength(126);
    expect(requestsFor(prefix)).toHaveLength(1);
    expect(requestsFor("/user")).toHaveLength(1);
    expect(requestsFor(`${prefix}/branches/main/protection`)).toHaveLength(1);
    expect(requestsFor(`${prefix}/rules/branches/main`)).toHaveLength(1);
    const secondPlan = withPollSummaryInstructions(
      { ...second, mode: "summary", repo: "octocat/hello-world", reason: "actionable" },
      true,
    );
    expect(secondPlan.instructions?.join("\n")).toContain("--merge-action merge_queue");
  });

  it.each([
    "finalHeadDrift",
    "finalStateDrift",
    "finalAutoMergeDrift",
    "finalBaseRefDrift",
    "membershipDrift",
    "membershipOrderDrift",
  ] as const)("rejects a moving stack with retryable failure: %s", async (drift) => {
    await freshLoadConfig();
    const fixture = await serveSummaryStack();
    fixture[drift] = true;
    await expect(fetch()).rejects.toMatchObject({ status: 409, exitCode: EXIT.TEMPFAIL });
  });

  it("shares one branch-policy read when multiple layers currently target the same branch", async () => {
    await freshLoadConfig();
    const fixture = await serveSummaryStack(2);
    fixture.sameBase = true;
    const result = await readRestStackSummary(101, repo);
    expect(result.ordered).toHaveLength(2);
    expect(requestsFor(`${prefix}/branches/main/protection`)).toHaveLength(1);
    expect(requestsFor(`${prefix}/rules/branches/main`)).toHaveLength(1);
  });

  it.each(["duplicate", "missing-anchor"])(
    "retains initial %s membership validation",
    async (invalid) => {
      await freshLoadConfig();
      const fixture = await serveSummaryStack(2);
      if (invalid === "duplicate") fixture.stack.pull_requests.push({ number: 101 });
      else fixture.stack.pull_requests.shift();
      await expect(readRestStackSummary(101, repo)).rejects.toThrow(
        "omitted anchor or repeated member",
      );
      expect(requestsFor(prefix)).toHaveLength(0);
      expect(requestsFor("/user")).toHaveLength(0);
    },
  );

  it("preserves stale stack boundaries for public ancestry routing", async () => {
    await freshLoadConfig();
    const fixture = await serveSummaryStack(2);
    fixture.sameBase = true;
    const result = await fetch();
    expect(result.stackAncestry).toMatchObject([
      { parentPr: 101, childPr: 102, childBaseRefName: "main" },
    ]);
  });
});
