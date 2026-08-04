import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  getStderr,
  getStdout,
  mockRunIterate,
} from "../test-helpers/cli-parser.iterate.test-support.mts";
import { makeIterateResult } from "../fixtures/cli-parser.iterate-fixtures.mts";
import { main } from "./cli-parser.mts";
import { EXIT } from "./exit-codes.mts";

registerHooks();

describe("main — default (poll)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to poll when no subcommand is given", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));
    await main(["node", "shepherd"]);
    expect(mockRunIterate).toHaveBeenCalledTimes(1);
    expect(mockRunIterate).toHaveBeenCalledWith(expect.objectContaining({ prNumber: undefined }));
    expect(process.exitCode).toBe(EXIT.OK);
  });

  it("defaults to poll when the first argument is a PR number", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));
    await main(["node", "shepherd", "42", "--format=json"]);
    expect(mockRunIterate).toHaveBeenCalledWith(expect.objectContaining({ prNumber: 42 }));
    expect(JSON.parse(getStdout().trimEnd()).pr).toBe(42);
  });

  it("defaults to poll when the first argument is a PR URL", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));
    await main(["node", "shepherd", "https://github.com/owner/repo/pull/42"]);
    expect(mockRunIterate).toHaveBeenCalledWith(expect.objectContaining({ prNumber: 42 }));
  });

  it("defaults to poll when the first argument is a poll/iterate flag", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));
    await main(["node", "shepherd", "--ready-delay", "15m"]);
    expect(mockRunIterate).toHaveBeenCalledWith(
      expect.objectContaining({ readyDelaySeconds: 15 * 60 }),
    );
  });

  it("accepts --interval and --timeout on the default path", async () => {
    mockRunIterate
      .mockResolvedValueOnce(makeIterateResult("wait"))
      .mockResolvedValue(makeIterateResult("cancel"));

    const promise = main(["node", "shepherd", "42", "--interval", "60s", "--timeout", "4.5m"]);
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;

    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    expect(process.exitCode).toBe(EXIT.OK);
  });

  it("accepts --until-terminal on the default path", async () => {
    mockRunIterate
      .mockResolvedValueOnce(makeIterateResult("mark_ready"))
      .mockResolvedValue(makeIterateResult("cancel"));

    const promise = main(["node", "shepherd", "42", "--until-terminal"]);
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;

    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    expect(process.exitCode).toBe(EXIT.OK);
  });

  it("loops on wait then stops on cancel — exits EX_OK", async () => {
    mockRunIterate
      .mockResolvedValueOnce(makeIterateResult("wait"))
      .mockResolvedValue(makeIterateResult("cancel"));

    const promise = main(["node", "shepherd", "42", "--interval", "30s", "--timeout", "300s"]);
    await vi.advanceTimersByTimeAsync(30_000);
    await promise;

    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    expect(getStdout()).toContain("[CANCEL]");
    expect(process.exitCode).toBe(EXIT.OK);
  });

  it("rejects unknown flag-first default invocations", async () => {
    await main(["node", "shepherd", "--formt", "json"]);
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(mockRunIterate).not.toHaveBeenCalled();
    expect(getStderr()).toContain("Unknown subcommand: --formt");
  });

  it("rejects extra positional arguments in default poll form", async () => {
    await main(["node", "shepherd", "42", "resolve"]);
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(mockRunIterate).not.toHaveBeenCalled();
    expect(getStderr()).toContain("Unknown subcommand: resolve");
  });
});

describe("main — iterate subcommand", () => {
  it("exits with iterateResultToExitCode(fix_code)=EXIT.FIX_CODE", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("fix_code"));
    await main(["node", "shepherd", "iterate", "42"]);
    expect(process.exitCode).toBe(EXIT.FIX_CODE);
  });

  it("exits with EXIT.WAIT for wait action", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42"]);
    expect(process.exitCode).toBe(EXIT.WAIT);
  });

  it("passes stallTimeoutSeconds derived from --stall-timeout to runIterate", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42", "--stall-timeout", "15m"]);
    expect(mockRunIterate).toHaveBeenCalledWith(
      expect.objectContaining({ stallTimeoutSeconds: 15 * 60 }),
    );
  });

  it("invalid --ready-delay exits before runIterate", async () => {
    await main(["node", "shepherd", "iterate", "42", "--ready-delay", "notaduration"]);
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(mockRunIterate).not.toHaveBeenCalled();
    expect(getStderr()).toContain("invalid --ready-delay");
  });

  it("--ready-delay without a value exits before runIterate", async () => {
    await main(["node", "shepherd", "iterate", "42", "--ready-delay", "--format=json"]);
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(mockRunIterate).not.toHaveBeenCalled();
    expect(getStderr()).toContain("--ready-delay requires a value");
  });
});
