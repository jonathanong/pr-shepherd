import { beforeEach, describe, expect, it, vi } from "vitest";

const { readFileSync, execFileSync } = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  execFileSync: vi.fn(),
}));
vi.mock("node:fs", () => ({ readFileSync }));
vi.mock("node:child_process", () => ({ execFileSync }));

import {
  defaultProcessStartDeps,
  parseLinuxStartTicks,
  readProcessStart,
  type ProcessStartDeps,
} from "./process-start.mts";

const STAT =
  "4242 (my (odd) proc) S 1 4242 4242 0 -1 4194560 100 0 0 0 1 2 0 0 20 0 1 0 987654 1 2";

const deps = (overrides: Partial<ProcessStartDeps>): ProcessStartDeps => ({
  platform: "darwin",
  readFile: () => {
    throw new Error("unexpected readFile");
  },
  ps: () => {
    throw new Error("unexpected ps");
  },
  ...overrides,
});

describe("parseLinuxStartTicks", () => {
  it("reads field 22 even when the command name contains parentheses and spaces", () => {
    expect(parseLinuxStartTicks(STAT)).toBe("987654");
  });

  it("returns undefined for a short or non-numeric stat line", () => {
    expect(parseLinuxStartTicks("1 (a) S 1")).toBeUndefined();
    expect(parseLinuxStartTicks(STAT.replace("987654", "x"))).toBeUndefined();
  });
});

describe("readProcessStart", () => {
  it("uses /proc start ticks on Linux", () => {
    const readFile = vi.fn(() => STAT);
    expect(readProcessStart(4242, deps({ platform: "linux", readFile }))).toBe("linux:987654");
    expect(readFile).toHaveBeenCalledWith("/proc/4242/stat");
  });

  it("is undefined on Linux when /proc cannot be read or parsed", () => {
    const unreadable = deps({
      platform: "linux",
      readFile: () => {
        throw new Error("ENOENT");
      },
    });
    expect(readProcessStart(1, unreadable)).toBeUndefined();
    expect(readProcessStart(1, deps({ platform: "linux", readFile: () => "garbage" }))).toBe(
      undefined,
    );
  });

  it("uses ps lstart on macOS and trims it", () => {
    const ps = vi.fn(() => "Thu Nov 19 18:00:00 2026\n");
    expect(readProcessStart(7, deps({ ps }))).toBe("Thu Nov 19 18:00:00 2026");
    expect(ps).toHaveBeenCalledWith(7);
  });

  it("is undefined when ps prints nothing, as for a process a sandbox hides", () => {
    expect(readProcessStart(7, deps({ ps: () => "  \n" }))).toBeUndefined();
  });

  it("is undefined when ps fails", () => {
    const failing = deps({
      ps: () => {
        throw new Error("ps: operation not permitted");
      },
    });
    expect(readProcessStart(7, failing)).toBeUndefined();
  });
});

describe("defaultProcessStartDeps", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads files as utf8", () => {
    readFileSync.mockReturnValue("stat");
    expect(defaultProcessStartDeps.readFile("/proc/1/stat")).toBe("stat");
    expect(readFileSync).toHaveBeenCalledWith("/proc/1/stat", "utf8");
  });

  it("runs ps with a C locale and a timeout", () => {
    execFileSync.mockReturnValue("start");
    expect(defaultProcessStartDeps.ps(9)).toBe("start");
    expect(execFileSync).toHaveBeenCalledWith(
      "ps",
      ["-o", "lstart=", "-p", "9"],
      expect.objectContaining({ timeout: 2000, env: expect.objectContaining({ LC_ALL: "C" }) }),
    );
  });
});
