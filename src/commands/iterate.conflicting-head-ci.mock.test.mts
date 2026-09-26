import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
  NOW,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { conflictingHeadFirstSeenUnix } from "../state/conflicting-head-seen.mts";
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

const headSha = "c".repeat(40);

function report() {
  return makeReport({
    headSha,
    headCheckSuitesEmpty: true,
    status: "FAILING",
    baseBranch: "main",
    mergeStatus: conflicts,
    checks: noChecks,
  });
}

describe("runIterate conflicting head with no CI", () => {
  let dir: string;
  let previous: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pr-shepherd-ci-"));
    previous = process.env["PR_SHEPHERD_STATE_DIR"];
    process.env["PR_SHEPHERD_STATE_DIR"] = dir;
  });

  afterEach(async () => {
    if (previous === undefined) delete process.env["PR_SHEPHERD_STATE_DIR"];
    else process.env["PR_SHEPHERD_STATE_DIR"] = previous;
    await rm(dir, { recursive: true, force: true });
  });

  it("says CI did not start once the head has been seen through the grace period", async () => {
    await conflictingHeadFirstSeenUnix(
      { owner: "owner", repo: "repo", pr: 42 },
      headSha,
      (NOW - 121) * 1000,
    );
    mockRunCheck.mockResolvedValue(report());
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
    mockRunCheck.mockResolvedValue(report());
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
