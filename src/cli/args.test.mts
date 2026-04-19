import { describe, it, expect } from "vitest";
import {
  getFlag,
  hasFlag,
  parseList,
  parseStatusPrNumbers,
  parseCommonArgs,
  parseDurationToMinutes,
  statusToExitCode,
  iterateActionToExitCode,
  deriveSimpleReady,
} from "./args.mts";
import type { PrSummary } from "../commands/status.mts";
import type { ShepherdAction } from "../types.mts";

// ---------------------------------------------------------------------------
// getFlag
// ---------------------------------------------------------------------------

describe("getFlag", () => {
  it("returns value for --flag value form", () => {
    expect(getFlag(["--format", "json"], "--format")).toBe("json");
  });

  it("returns value for --flag=value form", () => {
    expect(getFlag(["--format=json"], "--format")).toBe("json");
  });

  it("returns null when flag is absent", () => {
    expect(getFlag(["--no-cache"], "--format")).toBeNull();
  });

  it("returns null when flag is last arg with no value", () => {
    expect(getFlag(["--format"], "--format")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hasFlag
// ---------------------------------------------------------------------------

describe("hasFlag", () => {
  it("returns true when flag is present", () => {
    expect(hasFlag(["--no-cache", "42"], "--no-cache")).toBe(true);
  });

  it("returns false when flag is absent", () => {
    expect(hasFlag(["--format", "json"], "--no-cache")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseList
// ---------------------------------------------------------------------------

describe("parseList", () => {
  it("splits comma-separated values and trims", () => {
    expect(parseList("a, b , c")).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for null", () => {
    expect(parseList(null)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseList("")).toEqual([]);
  });

  it("drops empty items after split", () => {
    expect(parseList("a,,b")).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// parseStatusPrNumbers
// ---------------------------------------------------------------------------

describe("parseStatusPrNumbers", () => {
  it("extracts positional PR numbers", () => {
    expect(parseStatusPrNumbers(["42", "99"])).toEqual([42, 99]);
  });

  it("skips --flag and its value", () => {
    expect(parseStatusPrNumbers(["--format", "json", "42"])).toEqual([42]);
  });

  it("skips boolean flags", () => {
    expect(parseStatusPrNumbers(["--no-cache", "42"])).toEqual([42]);
  });

  it("returns empty for no PR numbers", () => {
    expect(parseStatusPrNumbers(["--format", "json"])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseCommonArgs — PR number detection
// ---------------------------------------------------------------------------

describe("parseCommonArgs — PR number detection", () => {
  it("extracts PR number from positional arg", () => {
    const { prNumber } = parseCommonArgs(["42"]);
    expect(prNumber).toBe(42);
  });

  it("does NOT treat --cache-ttl value as PR number", () => {
    const { prNumber } = parseCommonArgs(["--cache-ttl", "30"]);
    expect(prNumber).toBeUndefined();
  });

  it("does NOT treat --last-push-time value as PR number", () => {
    const { prNumber } = parseCommonArgs(["--last-push-time", "100", "42"]);
    expect(prNumber).toBe(42);
  });

  it("supports --format=json inline form", () => {
    const { global: g } = parseCommonArgs(["--format=json", "42"]);
    expect(g.format).toBe("json");
  });

  it("supports --format json space form", () => {
    const { global: g } = parseCommonArgs(["--format", "json"]);
    expect(g.format).toBe("json");
  });

  it("defaults format to text", () => {
    const { global: g } = parseCommonArgs([]);
    expect(g.format).toBe("text");
  });

  it("sets noCache=true when --no-cache is present", () => {
    const { global: g } = parseCommonArgs(["--no-cache"]);
    expect(g.noCache).toBe(true);
  });

  it("keeps subcommand-specific flags in extra", () => {
    const { extra } = parseCommonArgs(["--format", "json", "--cooldown-seconds", "60"]);
    expect(extra).toContain("--cooldown-seconds");
    expect(extra).toContain("60");
  });

  it("strips global flags from extra", () => {
    const { extra } = parseCommonArgs(["--format", "json", "--no-cache"]);
    expect(extra).not.toContain("--format");
    expect(extra).not.toContain("json");
    expect(extra).not.toContain("--no-cache");
  });
});

// ---------------------------------------------------------------------------
// parseDurationToMinutes
// ---------------------------------------------------------------------------

describe("parseDurationToMinutes", () => {
  it("parses plain number as minutes", () => {
    expect(parseDurationToMinutes("5")).toBe(5);
  });

  it("parses Nm suffix", () => {
    expect(parseDurationToMinutes("10m")).toBe(10);
  });

  it("parses Nmin suffix", () => {
    expect(parseDurationToMinutes("15min")).toBe(15);
  });

  it("parses Nminutes suffix", () => {
    expect(parseDurationToMinutes("20minutes")).toBe(20);
  });

  it("parses Nh as hours → minutes", () => {
    expect(parseDurationToMinutes("2h")).toBe(120);
  });

  it("parses Nhours as hours → minutes", () => {
    expect(parseDurationToMinutes("1hours")).toBe(60);
  });

  it("returns config default (10) for invalid input", () => {
    // Default config watch.readyDelayMinutes=10
    expect(parseDurationToMinutes("notaduration")).toBe(10);
  });

  it("uses explicit defaultMinutes when provided and input is invalid", () => {
    expect(parseDurationToMinutes("notaduration", 15)).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// statusToExitCode
// ---------------------------------------------------------------------------

describe("statusToExitCode", () => {
  it.each<[string, number]>([
    ["READY", 0],
    ["IN_PROGRESS", 2],
    ["UNRESOLVED_COMMENTS", 3],
    ["FAILING", 1],
    ["UNKNOWN", 1],
    ["BLOCKED", 1],
  ])("%s → %d", (status, code) => {
    expect(statusToExitCode(status)).toBe(code);
  });
});

// ---------------------------------------------------------------------------
// iterateActionToExitCode
// ---------------------------------------------------------------------------

describe("iterateActionToExitCode", () => {
  it.each<[ShepherdAction, number]>([
    ["fix_code", 1],
    ["rebase", 1],
    ["cancel", 2],
    ["escalate", 3],
    ["cooldown", 0],
    ["wait", 0],
    ["rerun_ci", 0],
    ["mark_ready", 0],
  ])("%s → %d", (action, code) => {
    expect(iterateActionToExitCode(action)).toBe(code);
  });
});

// ---------------------------------------------------------------------------
// deriveSimpleReady
// ---------------------------------------------------------------------------

describe("deriveSimpleReady", () => {
  function makeSummary(overrides: Partial<PrSummary> = {}): PrSummary {
    return {
      number: 1,
      title: "My PR",
      state: "OPEN",
      isDraft: false,
      mergeStateStatus: "CLEAN",
      reviewDecision: "APPROVED",
      unresolvedThreads: 0,
      ciState: "SUCCESS",
      threadsTruncated: false,
      ...overrides,
    };
  }

  it("returns true for a fully-ready PR", () => {
    expect(deriveSimpleReady(makeSummary())).toBe(true);
  });

  it("returns false when mergeStateStatus is not CLEAN", () => {
    expect(deriveSimpleReady(makeSummary({ mergeStateStatus: "BLOCKED" }))).toBe(false);
  });

  it("returns false when ciState is not SUCCESS", () => {
    expect(deriveSimpleReady(makeSummary({ ciState: "FAILURE" }))).toBe(false);
  });

  it("returns false when there are unresolved threads", () => {
    expect(deriveSimpleReady(makeSummary({ unresolvedThreads: 2 }))).toBe(false);
  });

  it("returns false when reviewDecision is CHANGES_REQUESTED", () => {
    expect(deriveSimpleReady(makeSummary({ reviewDecision: "CHANGES_REQUESTED" }))).toBe(false);
  });

  it("returns false when isDraft", () => {
    expect(deriveSimpleReady(makeSummary({ isDraft: true }))).toBe(false);
  });
});
