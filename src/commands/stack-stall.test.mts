import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import { readStackStallState } from "../state/stack-stall.mts";
import type { PollSummaryItem } from "../types.mts";
import { planPollSummary } from "./poll-summary-instructions.mts";
import { applyStackStallGuard } from "./stack-stall.mts";

const repo = { owner: "acme", name: "widgets" };
const key = { owner: "acme", repo: "widgets", stack: 9 };
let stateDir: string;

/** Stack #9 whose bottom draft waits on CI, so both layers can only wait. */
function idleStack(overrides: Partial<PollSummaryItem> = {}) {
  return planPollSummary(
    stack([
      row(1, 1, {
        isDraft: true,
        action: "wait",
        reasons: ["pending-or-unknown"],
        pollCommand: "pr-shepherd https://github.com/acme/widgets/pull/1 --timeout 1s",
        pollProbe: true,
        ...overrides,
      }),
      row(2, 2, { isDraft: true }),
    ]),
    false,
  );
}

function advance(seconds: number): void {
  vi.setSystemTime(Date.now() + seconds * 1000);
}

beforeEach(() => {
  stateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-stack-stall-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(async () => {
  vi.useRealTimers();
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(stateDir, { recursive: true, force: true });
});

describe("applyStackStallGuard", () => {
  it("escalates stall-timeout once an idle plan stays unchanged for the timeout", async () => {
    const planned = idleStack();
    expect(planned.idle?.map((item) => item.pr)).toEqual([1, 2]);
    await expect(applyStackStallGuard(planned, repo, 600)).resolves.toBe(planned.result);
    advance(599);
    await expect(applyStackStallGuard(planned, repo, 600)).resolves.toBe(planned.result);
    advance(1);
    await expect(applyStackStallGuard(planned, repo, 600)).resolves.toMatchObject({
      reason: "actionable",
      nextAction: "escalate",
      stackMergeable: false,
      instructions: [
        "1. `stall-timeout`: the stack has not changed for 10 minutes while no one-PR session could advance it: PR #1 (pending-or-unknown); PR #2 (stack-blocked by PR #1). Stop and ask a human to unblock the waiting layers.",
      ],
    });
  });

  it("restarts the timer when a waiting layer's head changes", async () => {
    await applyStackStallGuard(idleStack(), repo, 600);
    advance(600);
    const pushed = idleStack({ headRefOid: "f".repeat(40) });
    await expect(applyStackStallGuard(pushed, repo, 600)).resolves.toBe(pushed.result);
    await expect(readStackStallState(key)).resolves.toMatchObject({
      ok: true,
      state: { firstSeenAt: Date.now() / 1000 },
    });
  });

  it("restarts a timer stamped in the future", async () => {
    const planned = idleStack();
    await applyStackStallGuard(planned, repo, 600);
    advance(-60);
    await expect(applyStackStallGuard(planned, repo, 600)).resolves.toBe(planned.result);
    await expect(readStackStallState(key)).resolves.toMatchObject({
      ok: true,
      state: { firstSeenAt: Date.now() / 1000 },
    });
  });

  it("clears the timer when the plan has agent work", async () => {
    await applyStackStallGuard(idleStack(), repo, 600);
    const working = idleStack({ action: "fix_code", reasons: ["failing-checks"] });
    expect(working.idle).toBeUndefined();
    await expect(applyStackStallGuard(working, repo, 600)).resolves.toBe(working.result);
    await expect(readStackStallState(key)).resolves.toEqual({ ok: true, state: null });
  });

  it("clears the timer when the stall timeout is disabled", async () => {
    const planned = idleStack();
    await applyStackStallGuard(planned, repo, 600);
    advance(3600);
    await expect(applyStackStallGuard(planned, repo, 0)).resolves.toBe(planned.result);
    await expect(readStackStallState(key)).resolves.toEqual({ ok: true, state: null });
  });

  it("escalates stall-state-unavailable on each tick when the timer cannot be saved", async () => {
    const blocker = join(stateDir, "blocker");
    await mkdir(stateDir, { recursive: true });
    await writeFile(blocker, "not a directory");
    process.env["PR_SHEPHERD_STATE_DIR"] = blocker;
    const planned = idleStack();
    const first = await applyStackStallGuard(planned, repo, 600);
    const second = await applyStackStallGuard(planned, repo, 600);
    expect(first).toMatchObject({
      reason: "actionable",
      nextAction: "escalate",
      stackMergeable: false,
    });
    expect(first.instructions?.[0]).toContain("`stall-state-unavailable`");
    expect(first.instructions?.[0]).toContain("ENOTDIR");
    expect(second.instructions?.[0]).toContain("`stall-state-unavailable`");
    expect(second.nextAction).toBe("escalate");
  });

  it("returns the idle plan when the timeout is disabled and state cannot be saved", async () => {
    const blocker = join(stateDir, "blocker");
    await mkdir(stateDir, { recursive: true });
    await writeFile(blocker, "not a directory");
    process.env["PR_SHEPHERD_STATE_DIR"] = blocker;
    const planned = idleStack();
    await expect(applyStackStallGuard(planned, repo, 0)).resolves.toBe(planned.result);
  });

  it("leaves explicit selections alone", async () => {
    const planned = planPollSummary(
      { ...stack([row(1, 1)]), selection: { kind: "prs", requested: [1] } },
      false,
    );
    await expect(applyStackStallGuard(planned, repo, 600)).resolves.toBe(planned.result);
  });
});
