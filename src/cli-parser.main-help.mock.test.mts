// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerHooks, stderrSpy, stdoutSpy } from "./cli-parser.test-support.mts";
import { main } from "./cli-parser.mts";

registerHooks();

function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

describe("main — top-level help", () => {
  it("prints usage to stdout and exits 0 for --help", async () => {
    await main(["node", "shepherd", "--help"]);
    expect(getStdout()).toContain("Usage:");
    expect(getStdout()).toContain("pr-shepherd");
    expect(process.exitCode).toBeUndefined();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("prints usage to stdout and exits 0 for -h", async () => {
    await main(["node", "shepherd", "-h"]);
    expect(getStdout()).toContain("Usage:");
    expect(getStdout()).toContain("pr-shepherd");
    expect(process.exitCode).toBeUndefined();
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
