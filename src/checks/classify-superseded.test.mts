import { describe, it, expect } from "vitest";
import { classifyChecks, getCiVerdict } from "./classify.mts";
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

describe("classifyChecks — concurrency-superseded CANCELLED checks", () => {
  it("reclassifies CANCELLED as superseded when a newer run of the same workflow (by workflowId) exists", () => {
    const [older, newer] = classifyChecks([
      makeCheck({ name: "build", conclusion: "CANCELLED", workflowId: "1", runId: "100" }),
      makeCheck({ name: "tests", conclusion: "SUCCESS", workflowId: "1", runId: "200" }),
    ]);
    expect(older!.category).toBe("superseded");
    expect(newer!.category).toBe("passed");
  });

  it("groups by workflowName when workflowId is unavailable", () => {
    const [older, newer] = classifyChecks([
      makeCheck({ name: "build", conclusion: "CANCELLED", workflowName: "CI", runId: "100" }),
      makeCheck({
        name: "tests",
        status: "IN_PROGRESS",
        conclusion: null,
        workflowName: "CI",
        runId: "200",
      }),
    ]);
    expect(older!.category).toBe("superseded");
    // The still-running newer run's own check is unaffected by supersession logic.
    expect(newer!.category).toBe("in_progress");
  });

  it("does not merge two different workflows that share a display name when workflowId differs", () => {
    const [older, newer] = classifyChecks([
      makeCheck({
        name: "build",
        conclusion: "CANCELLED",
        workflowId: "1",
        workflowName: "CI",
        runId: "100",
      }),
      makeCheck({
        name: "tests",
        conclusion: "SUCCESS",
        workflowId: "2",
        workflowName: "CI",
        runId: "200",
      }),
    ]);
    // Different workflowId → different group, even though the display name collides.
    expect(older!.category).toBe("failing");
    expect(newer!.category).toBe("passed");
  });

  it("does not supersede the newest run of a workflow even when it is itself cancelled", () => {
    const [older, newest] = classifyChecks([
      makeCheck({ name: "build", conclusion: "CANCELLED", workflowId: "1", runId: "100" }),
      makeCheck({ name: "build", conclusion: "CANCELLED", workflowId: "1", runId: "200" }),
    ]);
    expect(older!.category).toBe("superseded");
    expect(newest!.category).toBe("failing");
  });

  it("never supersedes a genuine FAILURE on an older run, even when a newer run exists", () => {
    const [older, newer] = classifyChecks([
      makeCheck({ name: "build", conclusion: "FAILURE", workflowId: "1", runId: "100" }),
      makeCheck({ name: "tests", conclusion: "SUCCESS", workflowId: "1", runId: "200" }),
    ]);
    expect(older!.category).toBe("failing");
    expect(newer!.category).toBe("passed");
  });

  it("does not supersede a CANCELLED status-context check (no workflow identity, runId null)", () => {
    const [c] = classifyChecks([
      makeCheck({
        conclusion: "CANCELLED",
        runId: null,
        source: "status_context",
        workflowId: undefined,
        workflowName: undefined,
      }),
    ]);
    expect(c!.category).toBe("failing");
  });

  it("does not supersede a CANCELLED check with a non-numeric runId", () => {
    const [older] = classifyChecks([
      makeCheck({ name: "build", conclusion: "CANCELLED", workflowId: "1", runId: "not-a-number" }),
      makeCheck({ name: "tests", conclusion: "SUCCESS", workflowId: "1", runId: "200" }),
    ]);
    expect(older!.category).toBe("failing");
  });

  it("does not crash and stays failing when a CANCELLED check has a workflow identity but a null runId", () => {
    const [c] = classifyChecks([
      makeCheck({ conclusion: "CANCELLED", workflowId: "1", runId: null }),
    ]);
    expect(c!.category).toBe("failing");
  });

  it("detects the newer run regardless of array order (newer run's check listed first)", () => {
    const [newer, older] = classifyChecks([
      makeCheck({ name: "tests", conclusion: "SUCCESS", workflowId: "1", runId: "200" }),
      makeCheck({ name: "build", conclusion: "CANCELLED", workflowId: "1", runId: "100" }),
    ]);
    expect(newer!.category).toBe("passed");
    expect(older!.category).toBe("superseded");
  });
});

describe("getCiVerdict — supersededNames", () => {
  it("excludes superseded CANCELLED checks from anyFailing/allPassed and reports them in supersededNames", () => {
    const classified = classifyChecks([
      makeCheck({ name: "build", conclusion: "CANCELLED", workflowId: "1", runId: "100" }),
      makeCheck({ name: "tests", conclusion: "SUCCESS", workflowId: "1", runId: "200" }),
    ]);
    const verdict = getCiVerdict(classified);
    expect(verdict.anyFailing).toBe(false);
    expect(verdict.allPassed).toBe(true);
    expect(verdict.supersededNames).toEqual(["build"]);
  });

  it("dedupes supersededNames across duplicate check names", () => {
    const classified = classifyChecks([
      makeCheck({ name: "build", conclusion: "CANCELLED", workflowId: "1", runId: "100" }),
      makeCheck({ name: "build", conclusion: "CANCELLED", workflowId: "1", runId: "101" }),
      makeCheck({ name: "tests", conclusion: "SUCCESS", workflowId: "1", runId: "200" }),
    ]);
    const verdict = getCiVerdict(classified);
    expect(verdict.supersededNames).toEqual(["build"]);
  });

  it("returns an empty supersededNames array when nothing is superseded", () => {
    const classified = classifyChecks([makeCheck({ conclusion: "SUCCESS" })]);
    const verdict = getCiVerdict(classified);
    expect(verdict.supersededNames).toEqual([]);
  });
});
