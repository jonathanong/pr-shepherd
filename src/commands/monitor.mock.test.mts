import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

vi.mock("../github/client.mts", () => ({
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
}));

import { runMonitor, formatMonitorResult, type MonitorResult } from "./monitor.mts";

describe("runMonitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns prNumber, loopTag, loopPrompt for explicit PR", async () => {
    const result = await runMonitor({ format: "text", prNumber: 99 });
    expect(result.prNumber).toBe(99);
    expect(result.loopTag).toBe("#pr-shepherd-loop:pr=99:");
    expect(result.loopPrompt).toContain("#pr-shepherd-loop:pr=99:");
    expect(result.loopPrompt).toContain("npx pr-shepherd 99");
    expect(result.reusableCommand).toBe("npx pr-shepherd 99");
  });

  it("loopPrompt body is not doubled — key phrases appear exactly once", async () => {
    const result = await runMonitor({ format: "text", prNumber: 42 });
    expect(result.loopPrompt.split("npx pr-shepherd 42").length - 1).toBe(1);
    expect(result.loopPrompt.split("ScheduleWakeup").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("infers PR number from branch when none provided", async () => {
    const result = await runMonitor({ format: "text" });
    expect(result.prNumber).toBe(42);
  });

  it("includes --ready-delay in loop prompt when readyDelaySuffix is valid", async () => {
    const result = await runMonitor({ format: "text", prNumber: 42, readyDelaySuffix: "15m" });
    expect(result.loopPrompt).toContain("--ready-delay 15m");
  });

  it("includes --ready-delay in the reusable command when readyDelaySuffix is valid", async () => {
    const result = await runMonitor({
      format: "text",
      prNumber: 42,
      readyDelaySuffix: "15m",
      runtime: "codex",
    });
    expect(result.reusableCommand).toBe("npx pr-shepherd 42 --ready-delay 15m");
    expect(result.loopPrompt).toContain("npx pr-shepherd 42 --ready-delay 15m");
  });

  it("builds a Codex prompt without /loop or Cron instructions", async () => {
    const result = await runMonitor({ format: "text", prNumber: 42, runtime: "codex" });
    expect(result.loopPrompt).toContain("Codex recurrence rules");
    expect(result.loopPrompt).toContain("pick a fresh sleep/timeout between 1 and 4 minutes");
    expect(result.loopPrompt).toContain("Stop only when Shepherd emits `[CANCEL]`");
    expect(result.loopPrompt).toContain("npx pr-shepherd 42");
    expect(result.loopPrompt).not.toContain("CronList");
    expect(result.loopPrompt).not.toContain("CronDelete");
    expect(result.loopPrompt).toContain("Do not call `/loop`, `ScheduleWakeup`, `CronCreate`");
    expect(result.loopPrompt).not.toContain("Do NOT call `/loop`");
  });

  it("accepts hours suffix for readyDelaySuffix", async () => {
    const result = await runMonitor({ format: "text", prNumber: 42, readyDelaySuffix: "2h" });
    expect(result.loopPrompt).toContain("--ready-delay 2h");
  });

  it("throws for an invalid readyDelaySuffix (seconds not accepted)", async () => {
    await expect(
      runMonitor({ format: "text", prNumber: 42, readyDelaySuffix: "30s" }),
    ).rejects.toThrow(/Invalid --ready-delay/);
  });

  it("throws for an invalid readyDelaySuffix (days not accepted)", async () => {
    await expect(
      runMonitor({ format: "text", prNumber: 42, readyDelaySuffix: "1d" }),
    ).rejects.toThrow(/Invalid --ready-delay/);
  });

  it("throws for a plain-text invalid readyDelaySuffix", async () => {
    await expect(
      runMonitor({ format: "text", prNumber: 42, readyDelaySuffix: "invalid" }),
    ).rejects.toThrow(/Invalid --ready-delay/);
  });
});

describe("formatMonitorResult", () => {
  let fixture: MonitorResult;

  beforeAll(async () => {
    fixture = await runMonitor({ format: "text", prNumber: 42 });
  });

  it("emits MONITOR heading, loop tag, loop prompt, and instructions", () => {
    const md = formatMonitorResult(fixture);
    expect(md).toContain("# PR #42 [MONITOR]");
    expect(md).toContain("Loop tag: `#pr-shepherd-loop:pr=42:`");
    expect(md).not.toContain("Loop args:");
    expect(md).toContain("## Loop prompt");
    expect(md).toContain("## Instructions");
  });

  it("emits Codex reusable prompt and non-loop instructions", () => {
    const codexFixture: MonitorResult = {
      ...fixture,
      loopPrompt:
        "#pr-shepherd-loop:pr=42:\n\n**IMPORTANT — Codex recurrence rules:**\n\nRun in a single Bash call:\n  npx pr-shepherd 42",
    };
    const md = formatMonitorResult(codexFixture, { runtime: "codex" });
    expect(md).toContain("Reusable command: `npx pr-shepherd 42`");
    expect(md).toContain("Run the `## Loop prompt` body once inline now.");
    expect(md).toContain("before each rerun, pick a fresh sleep/timeout between 1 and 4 minutes");
    expect(md).not.toContain("Invoke the `/loop` skill");
    expect(md).not.toContain("CronList");
  });

  it("does not emit a ```loop fenced block", () => {
    const md = formatMonitorResult(fixture);
    expect(md).not.toContain("```loop");
  });

  it("key prompt phrases appear exactly once — no body duplication", () => {
    const md = formatMonitorResult(fixture);
    expect(md.match(/npx pr-shepherd 42/g)?.length).toBe(1);
    expect(md.match(/dynamic recurrence rules/g)?.length).toBe(1);
  });

  it("every ## heading is followed by a blank line", () => {
    const md = formatMonitorResult(fixture);
    const lines = md.split("\n");
    lines.forEach((line, i) => {
      if (line.startsWith("## ")) {
        expect(lines[i + 1], `blank line after "${line}"`).toBe("");
      }
    });
  });

  it("matches snapshot", () => {
    const md = formatMonitorResult(fixture);
    expect(md).toMatchSnapshot();
  });
});
