import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyChecks, getCiVerdict } from "./classify.mts";
import { _resetConfigCache } from "../config/load.mts";
import type { CheckRun } from "../types.mts";

function makeCheck(overrides: Partial<CheckRun>): CheckRun {
  return {
    name: "tests",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: "https://github.com/owner/repo/actions/runs/123/jobs/456",
    event: "pull_request",
    runId: "123",
    ...overrides,
  };
}

const originalCwd = process.cwd();
let tempCwd: string | null = null;

function withIgnoreChecks(patterns: string[]): void {
  tempCwd = mkdtempSync(join(tmpdir(), "shepherd-ignore-checks-test-"));
  writeFileSync(
    join(tempCwd, ".pr-shepherdrc.yml"),
    `ignoreChecks:\n${patterns.map((p) => `  - ${JSON.stringify(p)}`).join("\n")}\n`,
  );
  process.chdir(tempCwd);
  _resetConfigCache();
}

afterEach(() => {
  process.chdir(originalCwd);
  _resetConfigCache();
  if (tempCwd !== null) rmSync(tempCwd, { recursive: true, force: true });
  tempCwd = null;
});

describe("classifyChecks — ignoreChecks", () => {
  it("drops an exact ignored check name before classification", () => {
    withIgnoreChecks(["Kilo Code Review"]);
    const classified = classifyChecks([
      makeCheck({ name: "Kilo Code Review", conclusion: "FAILURE" }),
      makeCheck({ name: "tests", conclusion: "SUCCESS" }),
    ]);
    expect(classified.map((c) => c.name)).toEqual(["tests"]);
  });

  it("matches ignoreChecks as case-insensitive globs", () => {
    withIgnoreChecks(["kilo*"]);
    const classified = classifyChecks([
      makeCheck({ name: "Kilo Code Review", conclusion: "FAILURE" }),
      makeCheck({ name: "tests", conclusion: "SUCCESS" }),
    ]);
    expect(classified.map((c) => c.name)).toEqual(["tests"]);
  });

  it("keeps ignored checks out of the verdict", () => {
    withIgnoreChecks(["Kilo*"]);
    const classified = classifyChecks([
      makeCheck({ name: "Kilo Code Review", conclusion: "FAILURE" }),
      makeCheck({ name: "tests", conclusion: "SUCCESS" }),
    ]);
    const verdict = getCiVerdict(classified);
    expect(verdict.allPassed).toBe(true);
    expect(verdict.anyFailing).toBe(false);
    expect(verdict.anyInProgress).toBe(false);
  });
});
