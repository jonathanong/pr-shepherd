import { describe, expect, it, vi } from "vitest";
import {
  serve,
  pull,
  repo,
  prefix,
  serveWithEtags,
  etagResponses as log,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { freshLoadConfig } from "../../test-helpers/config/load-test-support.mts";
import { runIterate } from "../commands/iterate/index.mts";
import { runWithGithubTransport } from "./transport.mts";

/**
 * Charged-request budget of a REST one-PR tick on the upper layer of a two-layer native stack,
 * measured at the HTTP boundary. The fake answers like GitHub's conditional reads, so a request is
 * charged exactly when it is not a 304.
 */
const stack = {
  number: 42,
  node_id: "S_42",
  base: { ref: "main" },
  pull_requests: [{ number: 101 }, { number: 102 }],
};
const lowerSha = "a".repeat(40);
const upperSha = "c".repeat(40);

/** `lowerMerged`: GitHub retargeted the upper layer onto the trunk after the lower one merged. */
function layer(number: 101 | 102, lowerMerged: boolean) {
  const lower = number === 101;
  const onTrunk = lower || lowerMerged;
  return {
    ...pull,
    id: 100000 + number,
    node_id: `PR_${number}`,
    number,
    html_url: `https://github.com/octocat/hello-world/pull/${number}`,
    ...(lower &&
      lowerMerged && { state: "closed", merged_at: "2026-10-09T01:00:00Z", merged: true }),
    head: {
      ...pull.head,
      ref: lower ? "user-model" : "user-api",
      sha: lower ? lowerSha : upperSha,
    },
    base: { ref: onTrunk ? "main" : "user-model", sha: onTrunk ? "b".repeat(40) : lowerSha },
  };
}

async function serveStack(lowerMerged = false) {
  await serve((request, response) => {
    const path = request.path.split("?")[0]!;
    let body: unknown = [];
    if (path === "/user") body = { login: "author" };
    else if (path === `${prefix}/stacks`) body = [stack];
    else if (path === `${prefix}/stacks/42`) body = stack;
    else if (path === `${prefix}/pulls/101`) body = layer(101, lowerMerged);
    else if (path === `${prefix}/pulls/102`) body = layer(102, lowerMerged);
    else if (path === prefix)
      body = { allow_merge_commit: true, allow_squash_merge: true, allow_rebase_merge: true };
    else if (path.startsWith(`${prefix}/branches/`) && !path.endsWith("/protection")) {
      const name = path.slice(`${prefix}/branches/`.length);
      body = {
        name,
        commit: { sha: name === "main" ? "b".repeat(40) : lowerSha },
        protected: false,
        protection: { enabled: false },
      };
    } else if (path.endsWith("check-runs")) {
      body = {
        total_count: 1,
        check_runs: [
          {
            id: 1,
            node_id: "CR_1",
            name: "CI",
            status: "in_progress",
            conclusion: null,
            details_url: "https://github.com/octocat/hello-world/actions/runs/1",
            started_at: "2026-10-09T00:00:00Z",
            completed_at: null,
            check_suite: null,
            output: { title: null, summary: null, annotations_count: 0 },
          },
        ],
      };
    } else if (path.endsWith("check-suites")) body = { total_count: 0, check_suites: [] };
    else if (path.endsWith("actions/runs")) body = { total_count: 0, workflow_runs: [] };
    else if (path.includes("/compare/")) body = { behind_by: 0 };
    else if (path.endsWith("/protection")) {
      response.statusCode = 404;
      body = { message: "Branch not protected" };
    }
    response.end(JSON.stringify(body));
  });
}

const tick = (fingerprintCache: boolean) =>
  runWithGithubTransport("rest", () =>
    runIterate({
      prNumber: 102,
      targetRepository: repo,
      format: "json",
      readyDelaySeconds: 0,
      stallTimeoutSeconds: 0,
      noAutoMarkReady: true,
      fingerprintCache,
    }),
  );

const chargedPaths = () =>
  log.filter((entry) => entry.status !== 304).map((entry) => entry.path.split("?")[0]);

describe("REST native-stack layer tick cost", () => {
  // Cold: the one-PR snapshot (14 charged, the stack read included; the closing pull re-read is a
  // 304), the trunk's rules, branch summary and compare, and the stack topology. The topology's
  // stack list, stack, anchor pull, viewer and repeat membership reads replay the snapshot's
  // validators, so only the other layer's pull is charged.
  it.each([
    // Open lower layer: the trunk is not the base, so its branch summary and rules are charged.
    [false, 18],
    // Merged lower layer: GitHub retargeted the upper layer onto the trunk, so iterate's
    // stale-ancestry check reads the topology after the snapshot scope has closed.
    [true, 16],
  ])(
    "charges nothing on an unchanged second upper-layer tick (lower layer merged: %s)",
    async (lowerMerged, cold) => {
      await freshLoadConfig();
      serveWithEtags();
      await serveStack(lowerMerged);
      expect((await tick(false)).action).toBe("wait");
      expect(log).toHaveLength(25);
      expect(chargedPaths()).toHaveLength(cold);
      expect(chargedPaths()).toContain(`${prefix}/pulls/101`);
      for (const fingerprintCache of [true, false]) {
        log.length = 0;
        expect((await tick(fingerprintCache)).action).toBe("wait");
        expect(log).toHaveLength(25);
        expect(chargedPaths()).toEqual([]);
      }
    },
  );

  it("charges only the validator-less CCR thread read on an unchanged cloud layer tick", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await freshLoadConfig();
    serveWithEtags((path) => path.endsWith("/ccr/review_threads"));
    await serveStack(true);
    await tick(false);
    log.length = 0;
    expect((await tick(true)).action).toBe("wait");
    expect(chargedPaths()).toEqual([`${prefix}/pulls/102/ccr/review_threads`]);
  });
});
