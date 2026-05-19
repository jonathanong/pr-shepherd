import { describe, it, expect } from "vitest";
import { registerHooks, stderrSpy, stdoutSpy } from "./cli-parser.test-support.mts";
import { main } from "./cli-parser.mts";

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
    expect(out).toContain("pr-shepherd poll");
    expect(out).toContain("pr-shepherd resolve");
    expect(out).toContain("pr-shepherd commit-suggestion");
    expect(out).toContain("pr-shepherd clean <pr|branch|current|repo|all>");
    expect(out).toContain("pr-shepherd log-file");
    expect(out).toContain("pr [number]");
    expect(out).toContain("branch [name]");
    expect(out).toContain("current");
    expect(out).toContain("repo");
    expect(out).toContain("all");
    expect(out).toContain("Exit codes for iterate and poll:");
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
});
