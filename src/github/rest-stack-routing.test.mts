import { describe, expect, it, vi } from "vitest";
import {
  serve,
  wire,
  pull,
  repo,
  prefix,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { freshLoadConfig } from "../../test-helpers/config/load-test-support.mts";
import { fetchPollSummary } from "./poll-summary.mts";
import { runWithGithubTransport } from "./transport.mts";
import { runIterate } from "../commands/iterate/index.mts";
import { withPollSummaryInstructions } from "../commands/poll-summary-instructions.mts";
import { formatPollSummaryResult } from "../cli/poll-summary-formatter.mts";
import { projectStackOverview } from "../cli/stack-overview.mts";

const stack = {
  number: 42,
  node_id: "S_42",
  base: { ref: "main" },
  pull_requests: [{ number: 101 }, { number: 102 }],
};
const lowerSha = "a".repeat(40);
const upperSha = "c".repeat(40);

interface Policy {
  queue?: boolean;
  classic?: boolean;
  unavailable?: "classic" | "rules";
}

async function server(options: Policy & { drafts?: boolean } = {}) {
  await serve((request, response) => {
    const path = request.path.split("?")[0]!;
    let body: unknown = [];
    if (path === "/user") body = { login: "AUTHOR" };
    else if (path === `${prefix}/stacks`) body = [stack];
    else if (path === `${prefix}/stacks/42`) body = stack;
    else if (path === `${prefix}/pulls/101` || path === `${prefix}/pulls/102`) {
      const lower = path.endsWith("/101");
      body = {
        ...pull,
        id: lower ? 100001 : 100002,
        node_id: lower ? "PR_101" : "PR_102",
        number: lower ? 101 : 102,
        draft: options.drafts ?? false,
        user: { login: lower ? "author" : "other", type: "User" },
        head: {
          ...pull.head,
          ref: lower ? "user-model" : "user-api",
          sha: lower ? lowerSha : upperSha,
        },
        base: { ref: lower ? "main" : "user-model", sha: lower ? "b".repeat(40) : lowerSha },
      };
    } else if (path === prefix)
      body = { allow_merge_commit: true, allow_squash_merge: true, allow_rebase_merge: false };
    else if (path.endsWith("check-runs")) body = { total_count: 0, check_runs: [] };
    else if (path.endsWith("check-suites")) body = { total_count: 0, check_suites: [] };
    else if (path.endsWith("actions/runs")) body = { total_count: 0, workflow_runs: [] };
    else if (path.includes("/compare/")) body = { behind_by: 0 };
    else if (path.endsWith("/protection")) {
      body = {};
      if (options.unavailable === "classic" && path.includes("/main/")) {
        response.statusCode = 403;
        body = { message: "Resource not accessible by integration" };
      } else if (!options.classic || !path.includes("/main/")) {
        response.statusCode = 404;
        body = { message: "Branch not protected" };
      }
    } else if (path === `${prefix}/rules/branches/main`) {
      body = options.queue ? [{ type: "merge_queue", parameters: null }] : [];
      if (options.unavailable === "rules") {
        response.statusCode = 404;
        body = { message: "Not Found" };
      }
    }
    response.end(JSON.stringify(body));
  });
}

async function certify() {
  await runWithGithubTransport("rest", async () => {
    for (const pr of [101, 102]) {
      const result = await runIterate({
        prNumber: pr,
        targetRepository: repo,
        format: "json",
        readyDelaySeconds: 0,
        stallTimeoutSeconds: 0,
        noAutoMarkReady: true,
      });
      expect(result).toMatchObject({ action: "cancel", status: "READY" });
    }
  });
}

async function summary(merge: boolean, noAutoMarkReady = false) {
  return runWithGithubTransport("rest", async () => {
    const fetched = await fetchPollSummary({ stackPrNumber: 102, noAutoMarkReady }, repo);
    return withPollSummaryInstructions(
      { ...fetched, mode: "summary", repo: `${repo.owner}/${repo.name}`, reason: "actionable" },
      merge,
    );
  });
}

describe("REST native-stack routing through the public summary", () => {
  it("emits probe and CCR ready commands only for owned drafts", async () => {
    await freshLoadConfig();
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await server({ drafts: true });
    const result = await summary(false, true);
    expect(result.prs).toMatchObject([
      { pr: 101, owned: true, isDraft: true, pollProbe: true },
      { pr: 102, isDraft: true, pollProbe: true },
    ]);
    expect(result.prs[1]).not.toHaveProperty("owned");
    const instructions = result.instructions!.join("\n");
    expect(instructions).toContain(
      "Run `pr-shepherd https://github.com/octocat/hello-world/pull/101",
    );
    expect(instructions).toContain(
      "iterate https://github.com/octocat/hello-world/pull/101 --transport rest",
    );
    expect(instructions).not.toContain("pull/102");
    expect(instructions).toContain("PR #102 is not owned");
    expect(wire.requests.every(({ method }) => method === "GET")).toBe(true);
  });

  it("selects the authenticated viewer's session and preserves other authors' rows", async () => {
    await freshLoadConfig();
    await server();
    const result = await summary(false);
    expect(result).toMatchObject({
      nextAction: "shepherd",
      prs: [
        { pr: 101, authorLogin: "author", owned: true },
        { pr: 102, authorLogin: "other" },
      ],
    });
    expect(result.prs[1]).not.toHaveProperty("owned");
    const instructions = result.instructions!.join("\n");
    expect(instructions).toContain(
      "Run `pr-shepherd https://github.com/octocat/hello-world/pull/101",
    );
    expect(instructions).not.toContain(
      "Run `pr-shepherd https://github.com/octocat/hello-world/pull/102",
    );
    const overview = projectStackOverview(result);
    expect(overview.prs[0]).toMatchObject({ author: "author", owned: true });
    expect(overview.prs[1]).not.toHaveProperty("owned");
    const markdown = formatPollSummaryResult(result);
    expect(markdown).toContain("owner `@author` · owned");
    expect(markdown).toContain("owner `@other`");
    expect(wire.requests.some(({ path }) => path === "/user")).toBe(true);
    expect(wire.requests.some(({ path }) => path === "/graphql")).toBe(false);
    expect(wire.requests.every(({ method }) => method === "GET")).toBe(true);
  });

  it.each([
    [{ queue: true }, true, "merge_queue"],
    [{ queue: true, unavailable: "classic" }, true, "merge_queue"],
    [{}, false, "direct_merge"],
    [{ classic: true }, undefined, "default"],
    [{ unavailable: "rules", classic: true }, undefined, "default"],
    [{ unavailable: "classic" }, undefined, "default"],
  ] as const)(
    "uses trunk policy %j for the highest ready prefix",
    async (policy, required, action) => {
      await freshLoadConfig();
      const currentPolicy: Policy = { ...policy };
      delete currentPolicy.unavailable;
      await server(currentPolicy);
      await certify();
      // Simulate branch-policy access disappearing after real one-PR READY completions.
      Object.assign(currentPolicy, policy);
      const result = await summary(true);
      expect(result).toMatchObject({ nextAction: "merge", stackMergeable: true });
      expect(result.prs[0]?.requiresMergeQueue).toBe(required);
      // The upper layer has no queue rule on its parent branch; that must not override trunk policy.
      expect(result.prs[1]?.requiresMergeQueue).toBe(false);
      const instructions = result.instructions!.join("\n");
      expect(instructions).toContain(`--require-sha ${upperSha}`);
      expect(instructions).toContain(`--merge-action ${action}`);
      expect(instructions.includes("--method")).toBe(action === "direct_merge");
      const overview = projectStackOverview(result);
      const markdown = formatPollSummaryResult(result);
      if (required === undefined) expect(overview.prs[0]).not.toHaveProperty("requiresMergeQueue");
      else {
        expect(overview.prs[0]?.requiresMergeQueue).toBe(required);
        expect(markdown).toContain(`merge queue ${required ? "required" : "not required"}`);
        expect(
          formatPollSummaryResult({ ...result, selection: { kind: "prs", requested: [101, 102] } }),
        ).toContain(`merge queue ${required ? "required" : "not required"}`);
      }
      expect(wire.requests.some(({ path }) => path === "/graphql")).toBe(false);
      expect(wire.requests.every(({ method }) => method === "GET")).toBe(true);
    },
  );
});
