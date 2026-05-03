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
  reusableCommand: "npx pr-shepherd 42",
  loopPrompt: "#pr-shepherd-loop:pr=42:\nBODY",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  delete process.env.AGENT;
  delete process.env.CODEX_CI;
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mockRunStatus.mockResolvedValue([]);
  mockRunMonitor.mockResolvedValue(MONITOR_RESULT);
});

afterEach(() => {
  process.exitCode = undefined;
  delete process.env.AGENT;
  delete process.env.CODEX_CI;
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

describe("main — monitor", () => {
  it("dispatches to runMonitor and emits formatted output", async () => {
    await main(["node", "shepherd", "monitor", "42"]);
    expect(mockRunMonitor).toHaveBeenCalledTimes(1);
    expect(mockRunMonitor).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 42, runtime: "claude" }),
    );
    const out = getStdout();
    expect(out).toContain("# PR #42 [MONITOR]");
  });

  it("uses Codex monitor output when AGENT=codex", async () => {
    process.env.AGENT = "codex";
    mockRunMonitor.mockResolvedValue({
      ...MONITOR_RESULT,
      loopPrompt:
        "#pr-shepherd-loop:pr=42:\n\n**IMPORTANT — Codex recurrence rules:**\n\nRun in a single Bash call:\n  npx pr-shepherd 42",
    });
    await main(["node", "shepherd", "monitor", "42"]);
    expect(mockRunMonitor).toHaveBeenCalledWith(expect.objectContaining({ runtime: "codex" }));
    const out = getStdout();
    expect(out).toContain("Reusable command: `npx pr-shepherd 42`");
    expect(out).toContain("before each rerun, pick a fresh sleep/timeout between 1 and 4 minutes");
    expect(out).not.toContain("Invoke the `/loop` skill");
  });

  it("emits JSON when --format=json", async () => {
    await main(["node", "shepherd", "monitor", "42", "--format=json"]);
    const out = getStdout();
    const parsed = JSON.parse(out.trim());
    expect(parsed.prNumber).toBe(42);
    expect(parsed.loopTag).toBe("#pr-shepherd-loop:pr=42:");
    expect(parsed.loopArgs).toBeUndefined();
    expect(parsed.reusableCommand).toBeUndefined();
    expect(
      parsed.instructions.some((inst: string) => inst.toLowerCase().includes("invoke the `/loop` skill")),
    ).toBe(true);
  });

  it("emits Codex JSON instructions when CODEX_CI=1", async () => {
    process.env.CODEX_CI = "1";
    await main(["node", "shepherd", "monitor", "42", "--format=json"]);
    const parsed = JSON.parse(getStdout().trim());
    expect(parsed.reusableCommand).toBe("npx pr-shepherd 42");
    expect(parsed.instructions.join("\n")).toContain(
      "before each rerun, pick a fresh sleep/timeout between 1 and 4 minutes",
    );
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
