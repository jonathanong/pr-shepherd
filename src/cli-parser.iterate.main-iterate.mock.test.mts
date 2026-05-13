// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  getStderr,
  getStdout,
  mockRunIterate,
  runIterate,
} from "./cli-parser.iterate.test-support.mts";
import { makeIterateResult } from "./cli-parser.iterate-fixtures.mts";
import { main } from "./cli-parser.mts";

registerHooks();

describe("main — iterate", () => {
  it("defaults to iterate when no subcommand is given", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd"]);
    expect(mockRunIterate).toHaveBeenCalledTimes(1);
    expect(mockRunIterate).toHaveBeenCalledWith(expect.objectContaining({ prNumber: undefined }));
    expect(process.exitCode).toBe(0);
  });

  it("defaults to iterate when the first argument is a PR number", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "42", "--format=json"]);
    expect(mockRunIterate).toHaveBeenCalledWith(expect.objectContaining({ prNumber: 42 }));
    expect(JSON.parse(getStdout().trimEnd()).pr).toBe(42);
  });

  it("defaults to iterate when the first argument is a PR URL", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "https://github.com/owner/repo/pull/42"]);
    expect(mockRunIterate).toHaveBeenCalledWith(expect.objectContaining({ prNumber: 42 }));
  });

  it("defaults to iterate when the first argument is an iterate flag", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "--ready-delay", "15m"]);
    expect(mockRunIterate).toHaveBeenCalledWith(
      expect.objectContaining({ readyDelaySeconds: 15 * 60 }),
    );
  });

  it("rejects unknown flag-first default invocations", async () => {
    await main(["node", "shepherd", "--formt", "json"]);
    expect(process.exitCode).toBe(1);
    expect(mockRunIterate).not.toHaveBeenCalled();
    expect(getStderr()).toContain("Unknown subcommand: --formt");
  });

  it("rejects extra positional arguments in default iterate form", async () => {
    await main(["node", "shepherd", "42", "resolve"]);
    expect(process.exitCode).toBe(1);
    expect(mockRunIterate).not.toHaveBeenCalled();
    expect(getStderr()).toContain("Unknown subcommand: resolve");
  });

  it("exits with iterateActionToExitCode(fix_code)=1", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("fix_code"));
    await main(["node", "shepherd", "iterate", "42"]);
    expect(process.exitCode).toBe(1);
  });

  it("exits with 0 for wait action", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42"]);
    expect(process.exitCode).toBe(0);
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
    expect(process.exitCode).toBe(1);
    expect(mockRunIterate).not.toHaveBeenCalled();
    expect(getStderr()).toContain("invalid --ready-delay");
  });

  it("--ready-delay without a value exits before runIterate", async () => {
    await main(["node", "shepherd", "iterate", "42", "--ready-delay", "--format=json"]);
    expect(process.exitCode).toBe(1);
    expect(mockRunIterate).not.toHaveBeenCalled();
    expect(getStderr()).toContain("--ready-delay requires a value");
  });
});
