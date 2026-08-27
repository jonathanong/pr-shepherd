import { describe, it, expect } from "vitest";
import { registerHooks, stderrSpy, stdoutSpy } from "../test-helpers/cli-parser.test-support.mts";
import { main } from "./cli-parser.mts";
import { EXIT } from "./exit-codes.mts";

registerHooks();

function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

describe("main — top-level help", () => {
  it("prints usage to stdout and exits 0 for --help", async () => {
    await main(["node", "shepherd", "--help"]);
    const out = getStdout();
    expect(out).toContain("Usage:");
    expect(out).toContain("pr-shepherd [PR]");
    expect(out).toContain("pr-shepherd iterate");
    expect(out).toContain("pr-shepherd apply review");
    expect(out).toContain("pr-shepherd apply files");
    expect(out).toContain("pr-shepherd apply journal");
    expect(out).toContain("pr-shepherd build-suggestion-patches");
    expect(out).toContain("pr-shepherd admin clean <pr|branch|current|repo|all>");
    expect(out).toContain("pr-shepherd admin log-file");
    expect(out).not.toContain("pr-shepherd resolve");
    expect(out).not.toContain("pr-shepherd commit-suggestion");
    expect(out).toContain("pr [number]");
    expect(out).toContain("branch [name]");
    expect(out).toContain("current");
    expect(out).toContain("repo");
    expect(out).toContain("all");
    expect(out).toContain("Exit codes: 0 done, 10-19 PR state, 64-78 shepherd failed");
    expect(process.exitCode).toBeUndefined();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("prints usage to stdout and exits 0 for -h", async () => {
    await main(["node", "shepherd", "-h"]);
    const out = getStdout();
    expect(out).toContain("Usage:");
    expect(out).toContain("Commands:");
    expect(out).toContain("Common flags:");
    expect(out).toContain("Clean variants:");
    expect(process.exitCode).toBeUndefined();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it.each([
    [["apply"], "Unknown apply action"],
    [["admin"], "Unknown admin command"],
  ])("rejects an incomplete public command group", async (args, message) => {
    await main(["node", "shepherd", ...args]);

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining(message));
    expect(process.exitCode).toBe(EXIT.USAGE);
  });
});
