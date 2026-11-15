import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stallRepairMarkerPath } from "../state/stall-repair.mts";
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
  summary: { passing: 0, skipped: 0, filtered: 0, inProgress: 0, queued: 0, superseded: 0 },
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
  it("repairs once, then escalates stall-state-unavailable when the timer cannot be saved", async () => {
    const blocker = join(stateDir, "blocker");
    await mkdir(stateDir, { recursive: true });
    await writeFile(blocker, "not a directory");
    process.env["PR_SHEPHERD_STATE_DIR"] = blocker;
    try {
      const run = (result: IterateResult = prospective, persist = true) =>
        applyStallGuard(
          stallKey,
          600,
          "a".repeat(40),
          base,
          1,
          result,
          report,
          [],
          undefined,
          persist,
        );
      // A preview tick presents the repair step without consuming it.
      expect((await run(prospective, false)).action).toBe("triage");
      const first = await run();
      const second = await run();

      expect(first.action).toBe("triage");
      if (first.action !== "triage") return;
      expect(first.triage.instructions[0]).toContain("ENOTDIR");
      expect(first.triage.instructions[0]).toContain("PR_SHEPHERD_STATE_DIR");
      expect(second.action).toBe("escalate");
      if (second.action !== "escalate") return;
      expect(second.escalate.triggers).toEqual(["stall-state-unavailable"]);
      expect(second.escalate.suggestion).toContain("ENOTDIR");
      expect(second.escalate.humanMessage).toContain("`stall-state-unavailable`");
    } finally {
      await rm(stallRepairMarkerPath("acme/widgets#1"), { force: true });
    }
  });

  it("keeps the tick's own work and puts the repair step first", async () => {
    const blocker = join(stateDir, "blocker");
    await mkdir(stateDir, { recursive: true });
    await writeFile(blocker, "not a directory");
    process.env["PR_SHEPHERD_STATE_DIR"] = blocker;
    const work = {
      ...base,
      action: "triage",
      triage: { instructions: ["Fix each warranted item."] },
    } as unknown as IterateResult;
    try {
      const result = await applyStallGuard(
        stallKey,
        600,
        "a".repeat(40),
        base,
        1,
        work,
        report,
        [],
      );
      expect(result.action === "triage" && result.triage.instructions).toEqual([
        expect.stringContaining("could not be saved"),
        "Fix each warranted item.",
      ]);
    } finally {
      await rm(stallRepairMarkerPath("acme/widgets#1"), { force: true });
    }
  });

  it("escalates at once when the repair marker cannot be saved", async () => {
    const blocker = join(stateDir, "blocker");
    await mkdir(stateDir, { recursive: true });
    await writeFile(blocker, "not a directory");
    process.env["PR_SHEPHERD_STATE_DIR"] = blocker;
    const tmpdir = process.env["TMPDIR"];
    process.env["TMPDIR"] = join(stateDir, "missing", "tmp");
    try {
      const result = await applyStallGuard(
        stallKey,
        600,
        "a".repeat(40),
        base,
        1,
        prospective,
        report,
        [],
      );
      expect(result.action).toBe("escalate");
    } finally {
      if (tmpdir === undefined) delete process.env["TMPDIR"];
      else process.env["TMPDIR"] = tmpdir;
    }
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
