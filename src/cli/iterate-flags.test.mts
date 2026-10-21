import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config/load.mts")>()),
  loadConfig: mockLoadConfig,
}));

import type { loadConfig } from "../config/load.mts";
import { parseIterateFlags } from "./iterate-flags.mts";
import { EXIT } from "../exit-codes.mts";
import { testConfig } from "../../test-helpers/config/test-config.mts";

type PrShepherdConfig = ReturnType<typeof loadConfig>;

function defaultConfig(): PrShepherdConfig {
  return testConfig({
    "bot-usernames": [],
    checks: { "ci-trigger-events": ["pull_request"] },
    iterate: { "ready-delay-minutes": 10, instructions: "playbook" },
    poll: { "quota-warnings": [] },
    "mark-ready": { auto: false },
    actions: { "auto-minimize-suppressed": false },
  });
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
    expect(flags.merge).toBe(false);
  });

  it("defaults the ready delay to 0 for the poll loop and iterate with the built-in config", () => {
    expect(parseIterateFlags([], testConfig()).readyDelaySeconds).toBe(0);
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
    expect(process.exitCode).toBe(EXIT.USAGE);
    stderrSpy.mockRestore();
  });

  it("parses --no-auto-mark-ready", () => {
    const flags = parseIterateFlags(["--no-auto-mark-ready"], defaultConfig());
    expect(flags.noAutoMarkReady).toBe(true);
  });

  it("parses --merge", () => {
    expect(parseIterateFlags(["--merge"], defaultConfig()).merge).toBe(true);
  });

  it("parses --instructions in both spellings and leaves it undefined when absent", () => {
    expect(parseIterateFlags([], defaultConfig()).instructions).toBeUndefined();
    expect(parseIterateFlags(["--instructions", "inline"], defaultConfig()).instructions).toBe(
      "inline",
    );
    expect(parseIterateFlags(["--instructions=playbook"], defaultConfig()).instructions).toBe(
      "playbook",
    );
  });

  it("returns null instructions and a usage error on an invalid --instructions", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(parseIterateFlags(["--instructions", "bogus"], defaultConfig()).instructions).toBeNull();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("--instructions must be one of"),
    );
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(parseIterateFlags(["--instructions"], defaultConfig()).instructions).toBeNull();
    stderrSpy.mockRestore();
  });

  it("returns null readyDelaySuffix on malformed --ready-delay", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const flags = parseIterateFlags(["--ready-delay", "bad"], defaultConfig());
    expect(flags.readyDelaySuffix).toBeNull();
    stderrSpy.mockRestore();
  });
});
