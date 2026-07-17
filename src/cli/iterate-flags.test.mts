import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import type { loadConfig } from "../config/load.mts";
import { parseIterateFlags } from "./iterate-flags.mts";

type PrShepherdConfig = ReturnType<typeof loadConfig>;

function defaultConfig(): PrShepherdConfig {
  return {
    botUsernames: [],
    ignoreChecks: [],
    watch: { readyDelayMinutes: 10 },
    iterate: {
      fixAttemptsPerThread: 3,
      stallTimeoutMinutes: 60,
      minimizeApprovals: false,
      minimizeComments: "bots",
      behindBaseHint: "",
    },
    resolve: { shaPoll: { intervalMs: 2000, maxAttempts: 10 } },
    checks: { ciTriggerEvents: ["pull_request"] },
    mergeStatus: { blockingReviewerLogins: [] },
    actions: {
      autoResolveOutdated: false,
      autoMinimizeSuppressed: false,
      autoMarkReady: false,
      commitSuggestions: false,
      neverCancelRuns: [],
    },
  };
}

beforeEach(() => {
  process.exitCode = undefined;
  mockLoadConfig.mockReturnValue(defaultConfig());
});

afterEach(() => {
  process.exitCode = undefined;
});

describe("parseIterateFlags", () => {
  it("returns defaults when no flags given", () => {
    const flags = parseIterateFlags([], defaultConfig());
    expect(flags.readyDelaySuffix).toBeUndefined();
    expect(flags.readyDelaySeconds).toBe(600); // 10m * 60
    expect(flags.stallTimeoutSuffix).toBeUndefined();
    expect(flags.stallTimeoutSeconds).toBe(3600); // 60m * 60
    expect(flags.noAutoMarkReady).toBe(false);
    expect(flags.noAutoCancelActionable).toBe(false);
  });

  it("parses --ready-delay", () => {
    const flags = parseIterateFlags(["--ready-delay", "15m"], defaultConfig());
    expect(flags.readyDelaySuffix).toBe("15m");
    expect(flags.readyDelaySeconds).toBe(900);
  });

  it("parses --stall-timeout", () => {
    const flags = parseIterateFlags(["--stall-timeout", "1h"], defaultConfig());
    expect(flags.stallTimeoutSeconds).toBe(3600);
  });

  it("parses --stall-timeout with an explicit seconds suffix", () => {
    const flags = parseIterateFlags(["--stall-timeout", "60s"], defaultConfig());
    expect(flags.stallTimeoutSuffix).toBe("60s");
    expect(flags.stallTimeoutSeconds).toBe(60);
  });

  it("treats a bare --stall-timeout number as minutes", () => {
    const flags = parseIterateFlags(["--stall-timeout", "20"], defaultConfig());
    expect(flags.stallTimeoutSeconds).toBe(1200);
  });

  it("accepts --stall-timeout 0 to disable stall detection", () => {
    const flags = parseIterateFlags(["--stall-timeout", "0"], defaultConfig());
    expect(flags.stallTimeoutSuffix).toBe("0");
    expect(flags.stallTimeoutSeconds).toBe(0);
  });

  it("returns null stallTimeoutSuffix and sets exitCode on malformed --stall-timeout", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const flags = parseIterateFlags(["--stall-timeout", "bad"], defaultConfig());
    expect(flags.stallTimeoutSuffix).toBeNull();
    expect(process.exitCode).toBe(1);
    stderrSpy.mockRestore();
  });

  it("parses --no-auto-mark-ready", () => {
    const flags = parseIterateFlags(["--no-auto-mark-ready"], defaultConfig());
    expect(flags.noAutoMarkReady).toBe(true);
  });

  it("parses --no-auto-cancel-actionable", () => {
    const flags = parseIterateFlags(["--no-auto-cancel-actionable"], defaultConfig());
    expect(flags.noAutoCancelActionable).toBe(true);
  });

  it("returns null readyDelaySuffix on malformed --ready-delay", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const flags = parseIterateFlags(["--ready-delay", "bad"], defaultConfig());
    expect(flags.readyDelaySuffix).toBeNull();
    stderrSpy.mockRestore();
  });
});
