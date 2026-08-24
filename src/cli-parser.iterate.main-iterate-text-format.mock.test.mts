import { describe, it, expect } from "vitest";
import {
  registerHooks,
  getStdout,
  mockRunIterate,
} from "../test-helpers/cli-parser.iterate.test-support.mts";
import { makeIterateResult } from "../fixtures/cli-parser.iterate-fixtures.mts";
import { main } from "./cli-parser.mts";
import type {
  CancelReason,
  IterateResult,
} from "../test-helpers/cli-parser.iterate.test-support.mts";

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
      "1. No action is needed this tick. Continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.",
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
      "1. The CLI marked the PR ready for review. Continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.",
    );
  });
  it("cancel: heading includes [CANCEL] tag with reason and ## Instructions with stop steps", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("# PR #42 [CANCEL]");
    expect(out).toContain("— ready-delay-elapsed");
    expect(out).toContain("## Instructions");
    expect(out).toContain("1. Stop — the PR loop is complete. No further polling is needed.");
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
      "1. Stop — human direction is required before automated polling can resume.",
    );
  });
  it("wait: surfaces --ready-delay override as a header field, not a rerun command", async () => {
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
    // The override is surfaced once on the summary line; the instruction stays a plain no-op.
    expect(out).toContain("**ready-delay** `15m` (override)");
    expect(out).toContain(
      "1. No action is needed this tick. Continue with the next poll using the same interface and mode:",
    );
    expect(out).not.toContain("Recheck");
    expect(out).not.toContain("auto-cancel");
  });
  it("mark_ready: instructions are a plain no-op acknowledgement", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("mark_ready"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain(
      "1. The CLI marked the PR ready for review. Continue with the next poll using the same interface and mode:",
    );
  });
  it("cancel: instructions say the PR loop is complete", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("1. Stop — the PR loop is complete. No further polling is needed.");
    expect(out).not.toContain("CronList");
    expect(out).not.toContain("/loop cancel");
  });
  it("escalate: instructions say PR needs human direction", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("escalate"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain(
      "1. Stop — human direction is required before automated polling can resume.",
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
      "No action is needed this tick. Continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.",
    ]);
  });
  it("cancel json: emits reason field so consumers can branch without parsing log", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));
    await main(["node", "shepherd", "iterate", "42", "--format", "json"]);
    const parsed = JSON.parse(getStdout().trimEnd());
    expect(parsed.action).toBe("cancel");
    expect(parsed.reason).toBe("ready-delay-elapsed");
  });
  it("cancel text: ignoredNames appear in header when present", async () => {
    const base = makeIterateResult("cancel") as Extract<IterateResult, { action: "cancel" }>;
    mockRunIterate.mockResolvedValue({ ...base, ignoredNames: ["Kilo Code Review"] });
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).toContain("**ignored** `Kilo Code Review`");
  });
  it("cancel text: supersededNames appear in header when present", async () => {
    const base = makeIterateResult("cancel") as Extract<IterateResult, { action: "cancel" }>;
    mockRunIterate.mockResolvedValue({ ...base, supersededNames: ["CI / build"] });
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).toContain("**superseded** `CI / build`");
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
