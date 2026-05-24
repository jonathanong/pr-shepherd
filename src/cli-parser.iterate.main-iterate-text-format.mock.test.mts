import { describe, it, expect } from "vitest";
import { registerHooks, getStdout, mockRunIterate } from "./cli-parser.iterate.test-support.mts";
import { makeIterateResult } from "./cli-parser.iterate-fixtures.test-support.mts";
import { main } from "./cli-parser.mts";
import type { CancelReason, IterateResult } from "./cli-parser.iterate.test-support.mts";

registerHooks();

describe("main — iterate text format", () => {
  it("wait: heading includes [WAIT] tag, log body follows header, ## Instructions present", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toMatch(/^# PR #42 \[WAIT\]\n/);
    expect(out).toContain("WAIT: 0 passing, 1 in-progress");
    expect(out).toContain("## Instructions");
    expect(out).toContain(
      "1. Recheck: rerun `pr-shepherd 42` to continue the active goal once after a fresh 30s–4m delay.",
    );
  });
  it("mark_ready: heading includes [MARK_READY] tag and ## Instructions with end-iteration step", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("mark_ready"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("# PR #42 [MARK_READY]");
    expect(out).toContain("MARKED READY: PR 42");
    expect(out).toContain("## Instructions");
    expect(out).toContain(
      "1. The CLI already marked the PR ready for review. Recheck: rerun `pr-shepherd 42` to recheck once after a fresh 30s–4m delay.",
    );
  });
  it("cancel: heading includes [CANCEL] tag with reason and ## Instructions with stop steps", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("# PR #42 [CANCEL]");
    expect(out).toContain("— ready-delay-elapsed");
    expect(out).toContain("## Instructions");
    expect(out).toContain("1. Stop — the active goal is complete.");
  });
  it("escalate: heading, base/summary, humanMessage, then ## Instructions with stop steps", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("escalate"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toMatch(/^# PR #42 \[ESCALATE\]\n/);
    expect(out).toContain("**status** `IN_PROGRESS`");
    expect(out).toContain("⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required");
    expect(out).toContain("## Instructions");
    expect(out).toContain(
      "1. Stop — the PR needs human direction before iterating can resume. This is a manual handoff; do not continue automated fix attempts.",
    );
  });
  it("wait: instructions include rerun command", async () => {
    const result = makeIterateResult("wait");
    if (result.action !== "wait") throw new Error("unreachable");
    result.log =
      "WAIT: 6 passing, 1 in-progress — awaiting human review or branch protection — 600s until auto-cancel";
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42", "--ready-delay", "15m"]);
    const out = getStdout();
    expect(out).toContain(
      "WAIT: 6 passing, 1 in-progress — awaiting human review or branch protection",
    );
    expect(out).toContain(
      "1. Recheck: rerun `pr-shepherd 42 --ready-delay 15m` to continue the active goal once after a fresh 30s–4m delay.",
    );
    expect(out).not.toContain("auto-cancel");
  });
  it("mark_ready: instructions include rerun command", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("mark_ready"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain(
      "1. The CLI already marked the PR ready for review. Recheck: rerun `pr-shepherd 42` to recheck once after a fresh 30s–4m delay.",
    );
  });
  it("cancel: instructions say active goal is complete", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("1. Stop — the active goal is complete.");
    expect(out).not.toContain("CronList");
    expect(out).not.toContain("/loop cancel");
  });
  it("escalate: instructions say PR needs human direction", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("escalate"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain(
      "1. Stop — the PR needs human direction before iterating can resume. This is a manual handoff; do not continue automated fix attempts.",
    );
    expect(out).not.toContain("CronList");
  });
  it("## Checks section is absent when checks is empty", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait")); // checks: []
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).not.toContain("## Checks");
  });
  it("json format: emits a single JSON object+newline, no formatter output", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42", "--format", "json"]);
    const out = getStdout().trimEnd();
    expect(() => JSON.parse(out)).not.toThrow();
    const parsed = JSON.parse(out);
    expect(parsed.action).toBe("wait");
    expect(parsed.pr).toBe(42);
    expect(parsed.instructions).toEqual([
      "Recheck: rerun `pr-shepherd 42` to continue the active goal once after a fresh 30s–4m delay.",
    ]);
  });
  it("cancel json: emits reason field so consumers can branch without parsing log", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));
    await main(["node", "shepherd", "iterate", "42", "--format", "json"]);
    const parsed = JSON.parse(getStdout().trimEnd());
    expect(parsed.action).toBe("cancel");
    expect(parsed.reason).toBe("ready-delay-elapsed");
  });
  it("cancel text: each CancelReason value appears in the heading", async () => {
    const reasons: CancelReason[] = ["merged", "closed", "ready-delay-elapsed"];
    for (const reason of reasons) {
      const base = makeIterateResult("cancel") as Extract<IterateResult, { action: "cancel" }>;
      mockRunIterate.mockResolvedValue({ ...base, reason });
      await main(["node", "shepherd", "iterate", "42"]);
      const out = getStdout();
      expect(out).toContain(`# PR #42 [CANCEL] — ${reason}`);
    }
  });
  it("lean mode (default): summary line omits zero counts, false booleans, and non-READY remainingSeconds", async () => {
    // fixture: status=IN_PROGRESS, remainingSeconds=60, blockingBotReviewInProgress=false, isDraft=false
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42"]);
    const text = getStdout();
    // Zero counts omitted
    expect(text).not.toContain("skipped");
    expect(text).not.toContain("filtered");
    // False booleans omitted
    expect(text).not.toContain("shouldCancel");
    expect(text).not.toContain("blockingBotReviewInProgress");
    expect(text).not.toContain("isDraft");
    // remainingSeconds omitted when status != READY
    expect(text).not.toContain("remainingSeconds");
  });
  it("lean mode: remainingSeconds shown when status=READY and timer is positive", async () => {
    const result = {
      ...makeIterateResult("wait"),
      status: "READY" as const,
      remainingSeconds: 300,
    };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).toContain("**remainingSeconds** 300");
  });
});
