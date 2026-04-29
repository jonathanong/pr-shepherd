import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("./commands/resolve.mts", () => ({
  runResolveFetch: vi.fn(),
  runResolveMutate: vi.fn(),
}));
vi.mock("./commands/commit-suggestion.mts", () => ({
  runCommitSuggestion: vi.fn(),
}));
vi.mock("./commands/iterate.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/iterate.mts")>();
  return { ...actual, runIterate: vi.fn() };
});
vi.mock("./commands/status.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/status.mts")>();
  return {
    ...actual,
    runStatus: vi.fn(),
    formatStatusTable: vi.fn().mockReturnValue("status table"),
  };
});
vi.mock("./commands/monitor.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/monitor.mts")>();
  return { ...actual, runMonitor: vi.fn() };
});
vi.mock("./github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));

import { main } from "./cli-parser.mts";
import { runMonitor } from "./commands/monitor.mts";
import { runStatus } from "./commands/status.mts";

const mockRunMonitor = vi.mocked(runMonitor);
const mockRunStatus = vi.mocked(runStatus);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
let stderrSpy: any;

function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

const MONITOR_RESULT = {
  prNumber: 42,
  loopTag: "#pr-shepherd-loop:pr=42:",
  loopArgs: "4m",
  loopPrompt: "#pr-shepherd-loop:pr=42:\nBODY",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mockRunStatus.mockResolvedValue([]);
  mockRunMonitor.mockResolvedValue(MONITOR_RESULT);
});

afterEach(() => {
  process.exitCode = undefined;
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

describe("main — monitor", () => {
  it("dispatches to runMonitor and emits formatted output", async () => {
    await main(["node", "shepherd", "monitor", "42"]);
    expect(mockRunMonitor).toHaveBeenCalledTimes(1);
    expect(mockRunMonitor).toHaveBeenCalledWith(expect.objectContaining({ prNumber: 42 }));
    const out = getStdout();
    expect(out).toContain("# PR #42 [MONITOR]");
  });

  it("emits JSON when --format=json", async () => {
    await main(["node", "shepherd", "monitor", "42", "--format=json"]);
    const out = getStdout();
    const parsed = JSON.parse(out.trim()) as typeof MONITOR_RESULT;
    expect(parsed.prNumber).toBe(42);
    expect(parsed.loopTag).toBe("#pr-shepherd-loop:pr=42:");
    expect(parsed.loopArgs).toBe("4m");
  });

  it("accepts --ready-delay and forwards it to runMonitor", async () => {
    await main(["node", "shepherd", "monitor", "42", "--ready-delay", "10m"]);
    expect(mockRunMonitor).toHaveBeenCalledWith(
      expect.objectContaining({ readyDelaySuffix: "10m" }),
    );
    expect(process.exitCode).not.toBe(1);
  });

  it("warns on truly unknown flags but still calls runMonitor", async () => {
    await main(["node", "shepherd", "monitor", "42", "--unknown-xyz"]);
    const err = stderrSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(err).toContain("ignoring unknown flags");
    expect(mockRunMonitor).toHaveBeenCalled();
  });

  it("exits 1 with error when --ready-delay is followed by another flag (value treated as missing)", async () => {
    await main(["node", "shepherd", "monitor", "42", "--ready-delay", "--format=json"]);
    expect(process.exitCode).toBe(1);
    const err = stderrSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(err).toContain("--ready-delay requires a value");
    expect(mockRunMonitor).not.toHaveBeenCalled();
  });

  it("warns on unexpected positional arguments but still calls runMonitor", async () => {
    await main(["node", "shepherd", "monitor", "42", "extra-positional"]);
    const err = stderrSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(err).toContain("unexpected positional arguments");
    expect(mockRunMonitor).toHaveBeenCalled();
  });

  it("exits 1 and writes to stderr when runMonitor throws", async () => {
    mockRunMonitor.mockRejectedValue(new Error("No open PR found for current branch."));
    await main(["node", "shepherd", "monitor"]);
    expect(process.exitCode).toBe(1);
    const err = stderrSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(err).toContain("No open PR found");
  });
});
