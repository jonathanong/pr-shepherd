import { describe, it, expect, vi } from "vitest";
import {
  registerHooks,
  getStdout,
  mockRunLogFile,
  stderrSpy,
} from "../test-helpers/cli-parser.test-support.mts";
import { main } from "./cli-parser.mts";
import { EXIT } from "./exit-codes.mts";
import { durableStateRequested } from "./state/durable-state.mts";

registerHooks();

describe("main — log-file", () => {
  it("prints the log path as text without initializing normal command dispatch", async () => {
    mockRunLogFile.mockResolvedValue({ path: "/tmp/shepherd.md" });
    await main(["node", "shepherd", "log-file"]);
    expect(getStdout()).toBe("/tmp/shepherd.md\n");
  });

  it("prints the log path as JSON for --format=json", async () => {
    mockRunLogFile.mockResolvedValue({ path: "/tmp/shepherd.md" });
    await main(["node", "shepherd", "log-file", "--format=json"]);
    expect(JSON.parse(getStdout())).toEqual({ path: "/tmp/shepherd.md" });
  });

  it("routes the canonical admin log-file command before log initialization", async () => {
    mockRunLogFile.mockResolvedValue({ path: "/tmp/shepherd.md" });

    await main(["node", "shepherd", "admin", "log-file"]);

    expect(getStdout()).toBe("/tmp/shepherd.md\n");
  });

  it("prints the log path as JSON for --format json", async () => {
    mockRunLogFile.mockResolvedValue({ path: "/tmp/shepherd.md" });
    await main(["node", "shepherd", "log-file", "--format", "json"]);
    expect(JSON.parse(getStdout())).toEqual({ path: "/tmp/shepherd.md" });
  });

  it("resolves the event-mode log path inside the durable state scope", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "");
    const durable: boolean[] = [];
    mockRunLogFile.mockImplementation(async () => {
      durable.push(durableStateRequested());
      return { path: "/tmp/shepherd.md" };
    });
    await main(["node", "shepherd", "log-file", "--poll-mode", "event"]);
    await main(["node", "shepherd", "admin", "log-file", "--poll-mode", "poll"]);
    vi.unstubAllEnvs();
    expect(durable).toEqual([true, false]);
  });

  it("rejects an invalid --poll-mode value with a usage error", async () => {
    await main(["node", "shepherd", "log-file", "--poll-mode", "evnet"]);
    expect(stderrSpy).toHaveBeenCalledWith(
      'pr-shepherd: log-file: --poll-mode must be one of auto, poll, event, got "evnet"\n',
    );
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(mockRunLogFile).not.toHaveBeenCalled();
  });

  it("rejects a --poll-mode flag with no value", async () => {
    await main(["node", "shepherd", "admin", "log-file", "--poll-mode"]);
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(mockRunLogFile).not.toHaveBeenCalled();
  });

  it("reports log-file errors and sets exitCode", async () => {
    mockRunLogFile.mockRejectedValue(new Error("not in repo"));
    await main(["node", "shepherd", "log-file"]);
    expect(stderrSpy).toHaveBeenCalledWith("pr-shepherd: log-file: Error: not in repo\n");
    expect(process.exitCode).toBe(EXIT.SOFTWARE);
  });
});
