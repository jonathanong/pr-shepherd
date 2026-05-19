import { describe, it, expect } from "vitest";
import {
  registerHooks,
  getStdout,
  mockRunLogFile,
  mockRunResolveFetch,
  stderrSpy,
} from "./cli-parser.test-support.mts";
import { main } from "./cli-parser.mts";

registerHooks();

describe("main — log-file", () => {
  it("prints the log path as text without initializing normal command dispatch", async () => {
    mockRunLogFile.mockResolvedValue({ path: "/tmp/shepherd.md" });
    await main(["node", "shepherd", "log-file"]);
    expect(getStdout()).toBe("/tmp/shepherd.md\n");
    expect(mockRunResolveFetch).not.toHaveBeenCalled();
  });

  it("prints the log path as JSON for --format=json", async () => {
    mockRunLogFile.mockResolvedValue({ path: "/tmp/shepherd.md" });
    await main(["node", "shepherd", "log-file", "--format=json"]);
    expect(JSON.parse(getStdout())).toEqual({ path: "/tmp/shepherd.md" });
  });

  it("prints the log path as JSON for --format json", async () => {
    mockRunLogFile.mockResolvedValue({ path: "/tmp/shepherd.md" });
    await main(["node", "shepherd", "log-file", "--format", "json"]);
    expect(JSON.parse(getStdout())).toEqual({ path: "/tmp/shepherd.md" });
  });

  it("reports log-file errors and sets exitCode", async () => {
    mockRunLogFile.mockRejectedValue(new Error("not in repo"));
    await main(["node", "shepherd", "log-file"]);
    expect(stderrSpy).toHaveBeenCalledWith("pr-shepherd: log-file: Error: not in repo\n");
    expect(process.exitCode).toBe(1);
  });
});
