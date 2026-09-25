import { describe, expect, it, vi } from "vitest";
import { formatIterateResult } from "../cli/iterate-formatter.mts";
import { projectIterateLean } from "../cli/iterate-lean.mts";
import { GitHubRequestError } from "../github/errors.mts";
import type { CheckBlockerRef } from "../state/check-blockers.mts";
import {
  makeOpts,
  makeReport,
  mockGraphql,
  mockReadCheckBlockers,
  mockRunCheck,
  mockUpdateReadyDelay,
  mockWriteFixAttempts,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { pollRateLimitRetryAfterMs } from "./poll-quota.mts";
import { runIterate } from "./iterate/index.mts";
import type { TriagedCheck } from "../types.mts";

registerIterateHooks();

const pull: CheckBlockerRef = { owner: "acme", name: "widgets", number: 9, kind: "pull" };
const issue: CheckBlockerRef = { owner: "acme", name: "widgets", number: 8, kind: "issue" };

function failing(name: string, runId: string): TriagedCheck {
  return {
    name,
    status: "COMPLETED",
    conclusion: "FAILURE",
    detailsUrl: `https://github.com/acme/widgets/actions/runs/${runId}`,
    event: "pull_request",
    runId,
    runAttempt: 1,
    workflowName: "CI",
    category: "failing",
  };
}

function prepare(checks: TriagedCheck[], blocker: CheckBlockerRef, checkName: string) {
  mockReadCheckBlockers.mockResolvedValue([{ checkName, blocker, recordedAt: 1700000000 }]);
  mockRunCheck.mockResolvedValue(
    makeReport({
      repo: "acme/widgets",
      status: "FAILING",
      checks: {
        passing: [],
        failing: checks,
        inProgress: [],
        skipped: [],
        filtered: [],
        filteredNames: [],
        blockedByFilteredCheck: false,
      },
    }),
  );
  mockUpdateReadyDelay.mockResolvedValue({
    isReady: false,
    shouldCancel: false,
    remainingSeconds: 0,
  });
}

describe("check blockers during iterate", () => {
  it("waits when an open blocker is the only failing check", async () => {
    await prepare([failing("backend-tests (1)", "123")], pull, "backend-tests (1)");
    mockGraphql.mockResolvedValue({
      data: { repository: { pullRequest: { state: "OPEN", merged: false } } },
    });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("wait");
    expect(result.action === "wait" && result.log).toContain("acme/widgets#9");
    expect(formatIterateResult(result)).toContain("[WAIT]");
    expect(formatIterateResult(result)).toContain("acme/widgets#9");
    expect(JSON.stringify(projectIterateLean(result))).toContain("acme/widgets#9");
    expect(mockWriteFixAttempts).not.toHaveBeenCalled();
  });

  it("omits the deferred check when another failure remains", async () => {
    await prepare(
      [failing("backend-tests (1)", "123"), failing("lint", "124")],
      pull,
      "backend-tests (1)",
    );
    mockGraphql.mockResolvedValue({
      data: { repository: { pullRequest: { state: "OPEN", merged: false } } },
    });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.checks.map((check) => check.name)).toEqual(["lint"]);
    expect(formatIterateResult(result)).not.toContain("backend-tests (1)");
    expect(result.fix.checks.some((check) => check.rerunCommand?.includes("123"))).toBe(false);
  });

  it.each([
    ["merged pull", pull, { repository: { pullRequest: { state: "MERGED", merged: true } } }],
    ["closed issue", issue, { repository: { issue: { state: "CLOSED" } } }],
  ] as const)("tells the agent to update the branch after a %s", async (_label, blocker, body) => {
    await prepare([failing("backend-tests (1)", "123")], blocker, "backend-tests (1)");
    mockGraphql.mockResolvedValue({ data: body });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    const instructions = result.fix.instructions.join("\n");
    expect(instructions).toContain("gh pr update-branch 42 --rebase");
    expect(instructions).toContain("Do not rerun the job");
    expect(instructions).not.toContain("rerun:");
    expect(result.fix.checks[0]?.rerunCommand).toBeUndefined();
    expect(formatIterateResult(result)).not.toContain("rerun:");
  });

  it("propagates a lookup rate limit and keeps other lookup errors visible", async () => {
    await prepare([failing("backend-tests (1)", "123")], pull, "backend-tests (1)");
    const err = new GitHubRequestError("API rate limit exceeded", { status: 429 });
    mockGraphql.mockRejectedValueOnce(err);
    await expect(runIterate(makeOpts())).rejects.toBe(err);
    expect(pollRateLimitRetryAfterMs(err)).not.toBeNull();
    mockGraphql.mockRejectedValueOnce(new Error("boom"));
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.checks.map((check) => check.name)).toEqual(["backend-tests (1)"]);
    expect(result.fix.checks[0]?.rerunCommand).toContain("gh run rerun 123");
    expect(stderr.mock.calls.map((call) => String(call[0])).join("")).toContain(
      "check blocker lookup failed for acme/widgets#9 (ignored): boom",
    );
    stderr.mockRestore();
  });
});
