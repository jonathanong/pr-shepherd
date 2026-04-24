import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../github/client.mts", () => ({
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
}));

vi.mock("../config/load.mts", () => ({
  loadConfig: vi.fn(),
}));

import { runMonitor, formatMonitorResult, type MonitorResult } from "./monitor.mts";
import { loadConfig } from "../config/load.mts";
import type { PrShepherdConfig } from "../config/load.mts";

const defaultConfig = {
  watch: { interval: "4m", maxTurns: 50, expiresHours: 8, readyDelayMinutes: 10 },
} as unknown as PrShepherdConfig;

describe("runMonitor", () => {
  beforeEach(() => {
    vi.mocked(loadConfig).mockReturnValue(defaultConfig);
  });

  it("returns prNumber, loopTag, loopArgs, loopPrompt for explicit PR", async () => {
    const result = await runMonitor({ format: "text", prNumber: 99 });
    expect(result.prNumber).toBe(99);
    expect(result.loopTag).toBe("# pr-shepherd-loop:pr=99");
    expect(result.loopArgs).toBe("4m --max-turns 50 --expires 8h");
    expect(result.loopPrompt).toContain("# pr-shepherd-loop:pr=99");
    expect(result.loopPrompt).toContain("npx pr-shepherd iterate 99");
    // loopArgs is a short one-liner — not the combined invocation string
    expect(result.loopArgs).not.toContain("npx pr-shepherd");
  });

  it("loopPrompt body is not doubled — key phrases appear exactly once", async () => {
    const result = await runMonitor({ format: "text", prNumber: 42 });
    expect(result.loopPrompt.split("npx pr-shepherd iterate 42").length - 1).toBe(1);
    expect(result.loopPrompt.split("Self-dedup:").length - 1).toBe(1);
  });

  it("infers PR number from branch when none provided", async () => {
    const result = await runMonitor({ format: "text" });
    expect(result.prNumber).toBe(42);
  });

  it("throws a clear error when interval is not a valid duration string", async () => {
    vi.mocked(loadConfig).mockReturnValue({
      watch: { interval: "every 4 minutes", maxTurns: 50, expiresHours: 8, readyDelayMinutes: 10 },
    } as unknown as PrShepherdConfig);
    await expect(runMonitor({ format: "text", prNumber: 42 })).rejects.toThrow(
      "watch.interval must be a duration string",
    );
  });

  it("throws a clear error when expiresHours is not a positive integer", async () => {
    vi.mocked(loadConfig).mockReturnValue({
      watch: { interval: "4m", maxTurns: 50, expiresHours: "8h", readyDelayMinutes: 10 },
    } as unknown as PrShepherdConfig);
    await expect(runMonitor({ format: "text", prNumber: 42 })).rejects.toThrow(
      "watch.expiresHours must be a positive integer",
    );
  });

  it("throws a clear error when maxTurns is not a positive integer", async () => {
    vi.mocked(loadConfig).mockReturnValue({
      watch: { interval: "4m", maxTurns: 0, expiresHours: 8, readyDelayMinutes: 10 },
    } as unknown as PrShepherdConfig);
    await expect(runMonitor({ format: "text", prNumber: 42 })).rejects.toThrow(
      "watch.maxTurns must be a positive integer",
    );
  });

  it("respects config overrides for interval/maxTurns/expiresHours", async () => {
    vi.mocked(loadConfig).mockReturnValue({
      watch: { interval: "8m", maxTurns: 30, expiresHours: 4, readyDelayMinutes: 10 },
    } as unknown as PrShepherdConfig);
    const result = await runMonitor({ format: "text", prNumber: 42 });
    expect(result.loopArgs).toMatch(/^8m --max-turns 30 --expires 4h/);
  });

  it("includes --ready-delay in loop prompt when readyDelaySuffix is valid", async () => {
    const result = await runMonitor({ format: "text", prNumber: 42, readyDelaySuffix: "15m" });
    expect(result.loopPrompt).toContain("--ready-delay 15m");
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
  const fixture: MonitorResult = {
    prNumber: 42,
    loopTag: "# pr-shepherd-loop:pr=42",
    loopArgs: "4m --max-turns 50 --expires 8h",
    loopPrompt:
      "# pr-shepherd-loop:pr=42\n\n**IMPORTANT — recurrence rules:**\n- **Do NOT call `ScheduleWakeup` or `/loop`.** This session is fired by a recurring cron job. Either call creates a duplicate runner, causing concurrent git operations and `.git/index.lock` collisions.\n- End the turn cleanly after completing the actions below. The cron job handles the next fire.\n\n**Self-dedup:** Run `CronList`. If more than one job contains `# pr-shepherd-loop:pr=42`, keep the lowest job ID and `CronDelete` the rest (ignore errors — a concurrent runner may have already deleted them).\n\nRun in a single Bash call:\n  npx pr-shepherd iterate 42\n\nExit codes 0–3 are all valid. If the command crashes (non-zero exit, no markdown output starting with `# PR #42 [`), log the first line of stderr and continue — do not cancel the loop. The next cron fire will retry.\n\nThe output is Markdown. The first line is an H1 heading of the form `# PR #<N> [<ACTION>]`. Every output ends with a `## Instructions` section — follow those numbered steps exactly.",
  };

  it("emits MONITOR heading, loop tag, loop args, loop prompt, and instructions", () => {
    const md = formatMonitorResult(fixture);
    expect(md).toContain("# PR #42 [MONITOR]");
    expect(md).toContain("Loop tag: `# pr-shepherd-loop:pr=42`");
    expect(md).toContain("Loop args: `4m --max-turns 50 --expires 8h`");
    expect(md).toContain("## Loop prompt");
    expect(md).toContain("## Instructions");
  });

  it("does not emit a ```loop fenced block", () => {
    const md = formatMonitorResult(fixture);
    expect(md).not.toContain("```loop");
  });

  it("key prompt phrases appear exactly once — no body duplication", () => {
    const md = formatMonitorResult(fixture);
    expect(md.match(/npx pr-shepherd iterate 42/g)?.length).toBe(1);
    expect(md.match(/Self-dedup:/g)?.length).toBe(1);
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
