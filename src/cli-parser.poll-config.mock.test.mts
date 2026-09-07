import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pollConfig } = vi.hoisted(() => ({
  pollConfig: {
    intervalSeconds: 60,
    timeoutSeconds: 270,
    debounceSeconds: 60,
    quietStatus: false,
  },
}));

vi.mock("./commands/iterate/index.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/iterate/index.mts")>();
  return { ...actual, runIterate: vi.fn() };
});
vi.mock("./commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("./commands/resolve.mts", () => ({ runResolveMutate: vi.fn() }));
vi.mock("./commands/commit-suggestion.mts", () => ({ runCommitSuggestion: vi.fn() }));
vi.mock("./github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));
vi.mock("./config/load.mts", () => ({
  loadConfig: () => ({
    poll: pollConfig,
    watch: { readyDelayMinutes: 10 },
    iterate: { stallTimeoutMinutes: 60 },
  }),
}));

import { main } from "./cli-parser.mts";
import { runIterate } from "./commands/iterate/index.mts";
import { makeIterateResult } from "../fixtures/cli-parser.iterate-fixtures.mts";
import { EXIT } from "./exit-codes.mts";

const mockRunIterate = vi.mocked(runIterate);
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  process.exitCode = undefined;
  Object.assign(pollConfig, {
    intervalSeconds: 60,
    timeoutSeconds: 270,
    debounceSeconds: 60,
    quietStatus: false,
  });
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  process.exitCode = undefined;
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  vi.useRealTimers();
});

describe("main — configured poll defaults", () => {
  it("uses configured durations and quiet-status", async () => {
    Object.assign(pollConfig, {
      intervalSeconds: 2,
      timeoutSeconds: 5,
      debounceSeconds: 0,
      quietStatus: true,
    });
    mockRunIterate
      .mockResolvedValueOnce(makeIterateResult("wait"))
      .mockResolvedValue(makeIterateResult("cancel"));

    const promise = main(["node", "shepherd", "poll", "42"]);
    await vi.waitFor(() => expect(mockRunIterate).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(2_000);
    await promise;

    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    const stderr = stderrSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("");
    expect(stderr).toContain("sleeping 2s");
    expect(stderr).not.toContain("still running");
  });

  it("lets explicit duration flags override configured defaults", async () => {
    Object.assign(pollConfig, {
      intervalSeconds: 120,
      timeoutSeconds: 120,
      debounceSeconds: 0,
      quietStatus: false,
    });
    mockRunIterate
      .mockResolvedValueOnce(makeIterateResult("wait"))
      .mockResolvedValue(makeIterateResult("cancel"));

    const promise = main([
      "node",
      "shepherd",
      "poll",
      "42",
      "--interval",
      "1s",
      "--timeout",
      "2s",
      "--debounce",
      "1s",
    ]);
    await vi.advanceTimersByTimeAsync(1_000);
    await promise;

    expect(mockRunIterate).toHaveBeenCalledTimes(2);
  });

  it("lets --no-quiet-status override configured quiet output", async () => {
    Object.assign(pollConfig, {
      intervalSeconds: 1,
      timeoutSeconds: 3,
      debounceSeconds: 0,
      quietStatus: true,
    });
    mockRunIterate
      .mockResolvedValueOnce(makeIterateResult("wait"))
      .mockResolvedValue(makeIterateResult("cancel"));

    const promise = main(["node", "shepherd", "poll", "42", "--no-quiet-status"]);
    await vi.advanceTimersByTimeAsync(1_000);
    await promise;

    expect(stderrSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("")).toContain(
      "still running; next tick in 1s",
    );
  });

  it("rejects conflicting quiet-status flags", async () => {
    await main(["node", "shepherd", "poll", "42", "--quiet-status", "--no-quiet-status"]);

    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("cannot be used together"));
    expect(mockRunIterate).not.toHaveBeenCalled();
  });
});
