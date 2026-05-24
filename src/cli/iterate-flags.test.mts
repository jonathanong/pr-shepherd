import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import type { loadConfig } from "../config/load.mts";
import { parseIterateFlags } from "./iterate-flags.mts";

type PrShepherdConfig = ReturnType<typeof loadConfig>;

function defaultConfig(): PrShepherdConfig {
  return {
    botUsernames: [],
    watch: { readyDelayMinutes: 10 },
    iterate: {
      fixAttemptsPerThread: 3,
      stallTimeoutMinutes: 60,
      minimizeApprovals: false,
      minimizeComments: "bots",
    },
    resolve: { shaPoll: { intervalMs: 2000, maxAttempts: 10 }, fetchReviewSummaries: true },
    checks: { ciTriggerEvents: ["pull_request"] },
    mergeStatus: { blockingReviewerLogins: [] },
    actions: { autoResolveOutdated: false, autoMarkReady: false, commitSuggestions: false },
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
