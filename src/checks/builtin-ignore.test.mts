import { describe, expect, it } from "vitest";
import type { CheckRun } from "../types.mts";
import { isBuiltinIgnoredCheck } from "./builtin-ignore.mts";

const base: CheckRun = {
  name: "tests",
  status: "COMPLETED",
  conclusion: "FAILURE",
  detailsUrl: "https://github.com/owner/repo/actions/runs/1",
  event: "pull_request",
  runId: "1",
};

describe("isBuiltinIgnoredCheck", () => {
  it("matches the CodSpeed app check name", () => {
    expect(isBuiltinIgnoredCheck({ ...base, name: "CodSpeed Performance Analysis" })).toBe(true);
  });

  it("matches a CodSpeed details URL even when the check name is unrelated", () => {
    expect(
      isBuiltinIgnoredCheck({
        ...base,
        name: "Performance",
        detailsUrl: "https://app.codspeed.io/owner/repo/branches/feat?utm_source=github",
      }),
    ).toBe(true);
  });

  it("matches a CodSpeed workflow name", () => {
    expect(isBuiltinIgnoredCheck({ ...base, name: "gate", workflowName: "CodSpeed" })).toBe(true);
  });

  it("matches a CodSpeed summary", () => {
    expect(
      isBuiltinIgnoredCheck({ ...base, name: "analysis", summary: "Compared on CodSpeed" }),
    ).toBe(true);
  });

  it("does not match ordinary CI or a GitHub Actions benchmark job", () => {
    expect(isBuiltinIgnoredCheck(base)).toBe(false);
    expect(isBuiltinIgnoredCheck({ ...base, name: "Benchmark (CPU check)" })).toBe(false);
    expect(
      isBuiltinIgnoredCheck({ ...base, workflowName: "   ", detailsUrl: "", summary: "" }),
    ).toBe(false);
  });

  it("matches a Codecov check whose summary is the missing-base-report title", () => {
    expect(
      isBuiltinIgnoredCheck({
        ...base,
        name: "codecov/project/rust",
        detailsUrl: "https://app.codecov.io/gh/owner/repo/pull/1",
        runId: null,
        summary: "No coverage information found on base report",
      }),
    ).toBe(true);
  });

  it("is case-insensitive for Codecov missing-base-report", () => {
    expect(
      isBuiltinIgnoredCheck({
        ...base,
        name: "CODECOV/project",
        summary: "NO COVERAGE INFORMATION FOUND ON BASE REPORT",
      }),
    ).toBe(true);
  });

  it("does not match a Codecov coverage-target failure", () => {
    expect(
      isBuiltinIgnoredCheck({
        ...base,
        name: "codecov/patch",
        detailsUrl: "https://app.codecov.io/a/b",
        summary: "67.68% of diff hit (target 85.00%)",
      }),
    ).toBe(false);
  });

  it("does not match a missing-base-report phrase on a non-Codecov check", () => {
    expect(
      isBuiltinIgnoredCheck({
        ...base,
        name: "coverage",
        summary: "No coverage information found on base report",
      }),
    ).toBe(false);
  });
});
