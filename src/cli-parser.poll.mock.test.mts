import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./commands/iterate/index.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/iterate/index.mts")>();
  return { ...actual, runIterate: vi.fn() };
});
vi.mock("./commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("./commands/resolve.mts", () => ({
  runResolveMutate: vi.fn(),
}));
vi.mock("./commands/commit-suggestion.mts", () => ({ runCommitSuggestion: vi.fn() }));
vi.mock("./github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));

import { main } from "./cli-parser.mts";
import { runIterate } from "./commands/iterate/index.mts";
import { makeIterateResult } from "../fixtures/cli-parser.iterate-fixtures.mts";
import { EXIT } from "./exit-codes.mts";

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
    expect(process.exitCode).toBe(EXIT.OK);
  });

  it("routes 'poll' with wait then cancel — uses fake timers for sleep", async () => {
    mockRunIterate
      .mockResolvedValueOnce(makeIterateResult("wait"))
      .mockResolvedValue(makeIterateResult("cancel"));

    const promise = main(["node", "shepherd", "poll", "42"]);
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;

    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    expect(getStdout()).toContain("[CANCEL]");
    expect(process.exitCode).toBe(EXIT.OK);
  });

  it("accepts --interval and --timeout as minute durations", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));

    await main(["node", "shepherd", "poll", "42", "--interval", "1m", "--timeout", "4.5m"]);

    expect(mockRunIterate).toHaveBeenCalledTimes(1);
  });

  it("emits JSON output when --format=json", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));

    await main(["node", "shepherd", "poll", "42", "--format=json"]);

    const out = getStdout();
    const parsed = JSON.parse(out);
    expect(parsed.action).toBe("cancel");
  });

  it("accepts --verbose without error", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));

    await main(["node", "shepherd", "poll", "42", "--verbose"]);

    expect(process.exitCode).not.toBe(1);
    expect(mockRunIterate).toHaveBeenCalledTimes(1);
  });

  it("accepts --until-terminal and keeps polling after mark_ready", async () => {
    mockRunIterate
      .mockResolvedValueOnce(makeIterateResult("mark_ready"))
      .mockResolvedValue(makeIterateResult("cancel"));

    const promise = main(["node", "shepherd", "poll", "42", "--until-terminal"]);
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;

    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    expect(getStdout()).toContain("[CANCEL]");
    expect(process.exitCode).toBe(EXIT.OK);
  });

  it("keeps --merge polling bounded by --timeout", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));

    const promise = main([
      "node",
      "shepherd",
      "poll",
      "42",
      "--merge",
      "--interval",
      "1s",
      "--timeout",
      "1s",
    ]);
    await vi.advanceTimersByTimeAsync(1_000);
    await promise;

    expect(getStdout()).toContain("[WAIT]");
  });

  it("rejects an invalid --interval value", async () => {
    await main(["node", "shepherd", "poll", "42", "--interval", "bad"]);

    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("invalid --interval"));
    expect(mockRunIterate).not.toHaveBeenCalled();
  });

  it("rejects an invalid --timeout value", async () => {
    await main(["node", "shepherd", "poll", "42", "--timeout", "xyz"]);

    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("invalid --timeout"));
    expect(mockRunIterate).not.toHaveBeenCalled();
  });

  it("accepts --debounce 5m and --debounce 0", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));

    await main(["node", "shepherd", "poll", "42", "--debounce", "5m"]);
    expect(process.exitCode).not.toBe(EXIT.USAGE);
    expect(mockRunIterate).toHaveBeenCalledTimes(1);

    mockRunIterate.mockClear();
    process.exitCode = undefined;
    await main(["node", "shepherd", "poll", "42", "--debounce", "0"]);
    expect(process.exitCode).not.toBe(EXIT.USAGE);
    expect(mockRunIterate).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid --debounce value", async () => {
    await main(["node", "shepherd", "poll", "42", "--debounce", "bad"]);

    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("invalid --debounce"));
    expect(mockRunIterate).not.toHaveBeenCalled();
  });
});
