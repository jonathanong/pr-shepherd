import { describe, expect, it } from "vitest";
import {
  makeOpts,
  makeReport,
  mockRunCheck,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import type { MergeStatusResult, TriagedCheck } from "../types.mts";

registerIterateHooks();

function laterAttemptFailure(): TriagedCheck {
  return {
    name: "tests",
    status: "COMPLETED",
    conclusion: "FAILURE",
    detailsUrl: "https://github.com/owner/repo/actions/runs/123",
    event: "pull_request",
    runId: "123",
    runAttempt: 2,
    workflowName: "CI",
    logExcerpt: "Runner queue request timed out",
    category: "failing",
  };
}

function mergeStatus(
  status: "BEHIND" | "CONFLICTS",
  mergeStateStatus: "BEHIND" | "DIRTY",
): MergeStatusResult {
  return {
    status,
    state: "OPEN",
    isDraft: false,
    mergeable: status === "CONFLICTS" ? "CONFLICTING" : "MERGEABLE",
    reviewDecision: null,
    blockingBotReviewInProgress: false,
    mergeStateStatus,
  };
}

function repeatedFailureReport(status: "BEHIND" | "CONFLICTS", baseBranch: string) {
  return makeReport({
    status: "FAILING",
    baseBranch,
    mergeStatus: mergeStatus(status, status === "BEHIND" ? "BEHIND" : "DIRTY"),
    checks: {
      passing: [],
      failing: [laterAttemptFailure()],
      inProgress: [],
      skipped: [],
      filtered: [],
      filteredNames: [],
      blockedByFilteredCheck: false,
    },
  });
}

async function runBranchRecovery(status: "BEHIND" | "CONFLICTS", baseBranch: string) {
  mockRunCheck.mockResolvedValue(repeatedFailureReport(status, baseBranch));

  const result = await runIterate(makeOpts());

  expect(result.action).toBe("fix_code");
  if (result.action !== "fix_code") throw new Error("expected fix_code branch recovery");
  expect(result.fix.checks[0]?.rerunCommand).toBeUndefined();
  return result.fix.instructions;
}

describe("runIterate — repeated workflow branch recovery", () => {
  it("refreshes a behind branch before escalating", async () => {
    const instructions = await runBranchRecovery("BEHIND", "release/next");

    expect(instructions).toContain(
      "The workflow rerun still fails while the branch is behind PR base branch `release/next`. Inspect the current base branch for an existing fix before choosing a remediation.",
    );
    expect(instructions).toContain(
      "Rebase or otherwise update the PR branch from `release/next` according to repository conventions.",
    );
    expect(instructions).toContain("Push the updated PR head branch before iterating again.");
  });

  it("checks the base branch while resolving conflicts", async () => {
    const instructions = await runBranchRecovery("CONFLICTS", "main");

    expect(instructions).toContain(
      "The workflow rerun still fails while the branch conflicts with PR base branch `main`. Inspect the current base branch for an existing fix before choosing a remediation.",
    );
    expect(instructions).toContain(
      "Rebase or otherwise update the PR branch from `main` according to repository conventions, resolving conflicts as part of that update.",
    );
    expect(instructions.join("\n")).toContain("push to the PR head branch");
  });
});
