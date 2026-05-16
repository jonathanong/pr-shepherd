// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./commands/iterate/index.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/iterate/index.mts")>();
  return { ...actual, runIterate: vi.fn() };
});
vi.mock("./commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("./commands/resolve.mts", () => ({
  runResolveFetch: vi.fn(),
  runResolveMutate: vi.fn(),
}));
vi.mock("./commands/commit-suggestion.mts", () => ({ runCommitSuggestion: vi.fn() }));
vi.mock("./github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));

import { main } from "./cli-parser.mts";
import { runIterate } from "./commands/iterate/index.mts";
import { makeIterateResult } from "./cli-parser.iterate-fixtures.mts";

const mockRunIterate = vi.mocked(runIterate);

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  process.exitCode = undefined;
  delete process.env["SHEPHERD_POLL_VERBOSE"];
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  process.exitCode = undefined;
  delete process.env["SHEPHERD_POLL_VERBOSE"];
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  vi.useRealTimers();
});

describe("main — poll subcommand", () => {
  it("routes 'poll' to runPoll and emits cancel result", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));

    await main(["node", "shepherd", "poll", "42"]);

    expect(mockRunIterate).toHaveBeenCalledTimes(1);
    expect(getStdout()).toContain("[CANCEL]");
    expect(process.exitCode).toBe(2);
  });

  it("routes 'poll' with wait then cancel — uses fake timers for sleep", async () => {
    mockRunIterate
      .mockResolvedValueOnce(makeIterateResult("wait"))
      .mockResolvedValue(makeIterateResult("cancel"));

    const promise = main([
      "node",
      "shepherd",
      "poll",
      "42",
      "--interval",
      "30s",
      "--timeout",
      "300s",
    ]);
    await vi.advanceTimersByTimeAsync(30_000);
    await promise;

    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    expect(getStdout()).toContain("[CANCEL]");
    expect(process.exitCode).toBe(2);
  });

  it("accepts --interval and --timeout as minute durations", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));

    await main(["node", "shepherd", "poll", "42", "--interval", "1m", "--timeout", "5m"]);

    expect(mockRunIterate).toHaveBeenCalledTimes(1);
  });

  it("emits JSON output when --format=json", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));

    await main(["node", "shepherd", "poll", "42", "--format=json"]);

    const out = getStdout();
    const parsed = JSON.parse(out);
    expect(parsed.action).toBe("cancel");
  });

  it("sets SHEPHERD_POLL_VERBOSE when --verbose is passed", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));

    await main(["node", "shepherd", "poll", "42", "--verbose"]);

    expect(process.env["SHEPHERD_POLL_VERBOSE"]).toBe("1");
  });

  it("rejects an invalid --interval value", async () => {
    await main(["node", "shepherd", "poll", "42", "--interval", "bad"]);

    expect(process.exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("invalid --interval"));
    expect(mockRunIterate).not.toHaveBeenCalled();
  });

  it("rejects an invalid --timeout value", async () => {
    await main(["node", "shepherd", "poll", "42", "--timeout", "xyz"]);

    expect(process.exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("invalid --timeout"));
    expect(mockRunIterate).not.toHaveBeenCalled();
  });
});
