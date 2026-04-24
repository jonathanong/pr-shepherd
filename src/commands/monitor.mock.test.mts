import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../github/client.mts", () => ({
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
}));

vi.mock("../config/load.mts", () => ({
  loadConfig: vi.fn(),
}));

import { runMonitor, formatMonitorResult } from "./monitor.mts";
import { loadConfig } from "../config/load.mts";
import type { PrShepherdConfig } from "../config/load.mts";

const defaultConfig = {
  watch: { interval: "4m", maxTurns: 50, expiresHours: 8, readyDelayMinutes: 10 },
} as unknown as PrShepherdConfig;

describe("runMonitor", () => {
  beforeEach(() => {
    vi.mocked(loadConfig).mockReturnValue(defaultConfig);
  });

  it("returns prNumber, loopTag, loopInvocation, loopPrompt for explicit PR", async () => {
    const result = await runMonitor({
      format: "text",
      noCache: false,
      cacheTtlSeconds: 300,
      prNumber: 99,
    });
    expect(result.prNumber).toBe(99);
    expect(result.loopTag).toBe("# pr-shepherd-loop:pr=99");
    expect(result.loopInvocation).toContain("4m --max-turns 50 --expires 8h");
    expect(result.loopInvocation).toContain("# pr-shepherd-loop:pr=99");
    expect(result.loopInvocation).toContain("npx pr-shepherd iterate 99 --no-cache");
    expect(result.loopPrompt).toContain("pr-shepherd-loop:pr=99");
  });

  it("infers PR number from branch when none provided", async () => {
    const result = await runMonitor({ format: "text", noCache: false, cacheTtlSeconds: 300 });
    expect(result.prNumber).toBe(42);
  });

  it("throws a clear error when expiresHours is not a positive integer", async () => {
    vi.mocked(loadConfig).mockReturnValue({
      watch: { interval: "4m", maxTurns: 50, expiresHours: "8h", readyDelayMinutes: 10 },
    } as unknown as PrShepherdConfig);
    await expect(
      runMonitor({ format: "text", noCache: false, cacheTtlSeconds: 300, prNumber: 42 }),
    ).rejects.toThrow("watch.expiresHours must be a positive integer");
  });

  it("throws a clear error when maxTurns is not a positive integer", async () => {
    vi.mocked(loadConfig).mockReturnValue({
      watch: { interval: "4m", maxTurns: 0, expiresHours: 8, readyDelayMinutes: 10 },
    } as unknown as PrShepherdConfig);
    await expect(
      runMonitor({ format: "text", noCache: false, cacheTtlSeconds: 300, prNumber: 42 }),
    ).rejects.toThrow("watch.maxTurns must be a positive integer");
  });

  it("respects config overrides for interval/maxTurns/expiresHours", async () => {
    vi.mocked(loadConfig).mockReturnValue({
      watch: { interval: "8m", maxTurns: 30, expiresHours: 4, readyDelayMinutes: 10 },
    } as unknown as PrShepherdConfig);
    const result = await runMonitor({
      format: "text",
      noCache: false,
      cacheTtlSeconds: 300,
      prNumber: 42,
    });
    expect(result.loopInvocation).toMatch(/^8m --max-turns 30 --expires 4h/);
  });
});

describe("formatMonitorResult", () => {
  it("emits MONITOR heading, loop tag, loop fenced block, and instructions", () => {
    const result = {
      prNumber: 42,
      loopTag: "# pr-shepherd-loop:pr=42",
      loopInvocation: "4m --max-turns 50 --expires 8h\n\n# pr-shepherd-loop:pr=42\nBODY",
      loopPrompt: "# pr-shepherd-loop:pr=42\nBODY",
    };
    const md = formatMonitorResult(result);
    expect(md).toContain("# PR #42 [MONITOR]");
    expect(md).toContain("Loop tag: `# pr-shepherd-loop:pr=42`");
    expect(md).toContain("```loop\n4m --max-turns 50 --expires 8h");
    expect(md).toContain("## Instructions");
    expect(md).toContain("## Loop prompt");
  });
});
