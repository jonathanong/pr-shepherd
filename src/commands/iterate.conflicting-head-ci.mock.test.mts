import { describe, expect, it } from "vitest";
import {
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
  NOW,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

const conflicts = {
  status: "CONFLICTS" as const,
  state: "OPEN" as const,
  isDraft: false,
  mergeable: "CONFLICTING" as const,
  reviewDecision: null,
  blockingBotReviewInProgress: false,
  mergeStateStatus: "DIRTY" as const,
};

const noChecks = {
  passing: [],
  failing: [],
  inProgress: [],
  skipped: [],
  filtered: [],
  filteredNames: [],
  blockedByFilteredCheck: false,
};

function report(committedAt: number) {
  return makeReport({
    headSha: "c".repeat(40),
    headCheckSuitesEmpty: true,
    status: "FAILING",
    baseBranch: "main",
    mergeStatus: conflicts,
    checks: noChecks,
    activity: {
      commitCount: 1,
      reviewRoundCount: 0,
      latestCommitCommittedAtUnix: committedAt,
      reviewItemsSinceLatestCommit: [],
    },
  });
}

describe("runIterate conflicting head with no CI", () => {
  it("says CI did not start once the grace period has elapsed", async () => {
    mockRunCheck.mockResolvedValue(report(NOW - 121));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.instructions.join("\n")).toContain("did not start pull_request workflows");
  });

  it("omits the note while the head commit is still inside the grace period", async () => {
    mockRunCheck.mockResolvedValue(report(NOW));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.instructions.join("\n")).not.toContain(
      "did not start pull_request workflows",
    );
  });
});
