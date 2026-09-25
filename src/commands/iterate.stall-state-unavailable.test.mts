import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyStallGuard } from "./iterate/stall.mts";
import type { IterateResult, IterateResultBase, ShepherdReport } from "../types.mts";

const report = {
  repo: "acme/widgets",
  checks: { failing: [], inProgress: [], passing: [], skipped: [], filtered: [] },
  threads: { actionable: [], resolutionOnly: [] },
  comments: { actionable: [] },
  changesRequestedReviews: [],
} as unknown as ShepherdReport;

const base = {
  pr: 1,
  repo: "acme/widgets",
  status: "IN_PROGRESS",
  state: "OPEN",
  mergeStateStatus: "CLEAN",
  mergeStatus: "CLEAN",
  reviewDecision: "REVIEW_REQUIRED",
  blockingBotReviewInProgress: false,
  isDraft: false,
  shouldCancel: false,
  remainingSeconds: 0,
  summary: { passing: 0, skipped: 0, filtered: 0, inProgress: 0, superseded: 0 },
  baseBranch: "main",
  branchProtection: null,
  checks: [],
} as IterateResultBase;

const prospective: IterateResult = { ...base, action: "wait", log: "waiting on CI" };
const stallKey = { owner: "acme", repo: "widgets", pr: 1 };

let stateDir: string;

beforeEach(() => {
  stateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-stall-unavailable-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(stateDir, { recursive: true, force: true });
});

describe("applyStallGuard persistence failure", () => {
  it("escalates stall-state-unavailable on each tick when the timer cannot be saved", async () => {
    const blocker = join(stateDir, "blocker");
    await mkdir(stateDir, { recursive: true });
    await writeFile(blocker, "not a directory");
    process.env["PR_SHEPHERD_STATE_DIR"] = blocker;

    const first = await applyStallGuard(
      stallKey,
      600,
      "a".repeat(40),
      base,
      1,
      prospective,
      report,
      [],
    );
    const second = await applyStallGuard(
      stallKey,
      600,
      "a".repeat(40),
      base,
      1,
      prospective,
      report,
      [],
    );

    expect(first.action).toBe("escalate");
    expect(second.action).toBe("escalate");
    if (first.action !== "escalate" || second.action !== "escalate") return;
    expect(first.escalate.triggers).toEqual(["stall-state-unavailable"]);
    expect(second.escalate.triggers).toEqual(["stall-state-unavailable"]);
    expect(first.escalate.suggestion).toContain("ENOTDIR");
    expect(first.escalate.suggestion).toContain("PR_SHEPHERD_STATE_DIR");
    expect(first.escalate.humanMessage).toContain("`stall-state-unavailable`");
  });

  it("returns the original action when the timeout is disabled", async () => {
    const blocker = join(stateDir, "blocker");
    await mkdir(stateDir, { recursive: true });
    await writeFile(blocker, "not a directory");
    process.env["PR_SHEPHERD_STATE_DIR"] = blocker;

    await expect(
      applyStallGuard(stallKey, 0, "a".repeat(40), base, 1, prospective, report, []),
    ).resolves.toBe(prospective);
  });
});
