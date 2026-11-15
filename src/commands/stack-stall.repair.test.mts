import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import { stallRepairMarkerPath } from "../state/stall-repair.mts";
import type { PollSummaryItem } from "../types.mts";
import { planPollSummary } from "./poll-summary-instructions.mts";
import { applyStackStallGuard, isStackRepairTick } from "./stack-stall.mts";

const repo = { owner: "acme", name: "widgets" };
let stateDir: string;

/** Stack #9 whose layers can only wait. */
function idleStack() {
  const waiting: Partial<PollSummaryItem> = {
    isDraft: true,
    action: "wait" as const,
    reasons: ["pending-or-unknown"],
    pollProbe: true,
  };
  const poll = (pr: number) =>
    `pr-shepherd https://github.com/acme/widgets/pull/${pr} --timeout 1s`;
  return planPollSummary(
    stack([
      row(1, 1, { ...waiting, pollCommand: poll(1) }),
      row(2, 2, { ...waiting, pollCommand: poll(2) }),
    ]),
    false,
  );
}

beforeEach(async () => {
  stateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-stack-repair-${randomBytes(4).toString("hex")}`;
  await mkdir(stateDir, { recursive: true });
  const blocker = join(stateDir, "blocker");
  await writeFile(blocker, "not a directory");
  process.env["PR_SHEPHERD_STATE_DIR"] = blocker;
});

afterEach(async () => {
  await rm(stallRepairMarkerPath("acme/widgets stack 9"), { force: true });
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(stateDir, { recursive: true, force: true });
});

describe("applyStackStallGuard when the timer cannot be saved", () => {
  it("repairs once, then escalates stall-state-unavailable", async () => {
    const planned = idleStack();
    const first = await applyStackStallGuard(planned, repo, 600);
    const second = await applyStackStallGuard(planned, repo, 600);
    expect(first).toMatchObject({ nextAction: "shepherd", reason: "actionable" });
    expect(isStackRepairTick(first)).toBe(true);
    expect(isStackRepairTick(second)).toBe(false);
    expect(first.instructions?.at(-1)).toMatch(/^\d+\. The stall timer could not be saved/);
    expect(first.instructions?.at(-1)).toContain("ENOTDIR");
    expect(second).toMatchObject({
      reason: "actionable",
      nextAction: "escalate",
      stackMergeable: false,
    });
    expect(second.instructions?.[0]).toContain("`stall-state-unavailable`");
    expect(second.instructions?.[0]).toContain("ENOTDIR");
  });

  it("escalates at once when the repair marker cannot be saved", async () => {
    const tmpdir = process.env["TMPDIR"];
    process.env["TMPDIR"] = join(stateDir, "missing", "tmp");
    try {
      const result = await applyStackStallGuard(idleStack(), repo, 600);
      expect(result.nextAction).toBe("escalate");
    } finally {
      if (tmpdir === undefined) delete process.env["TMPDIR"];
      else process.env["TMPDIR"] = tmpdir;
    }
  });
});
