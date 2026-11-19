import { describe, expect, it } from "vitest";
import { classifyChecks, getCiVerdict } from "./classify.mts";
import type { CheckRun } from "../types.mts";

function run(overrides: Partial<CheckRun>): CheckRun {
  return {
    name: "tests",
    status: "IN_PROGRESS",
    conclusion: null,
    detailsUrl: "",
    event: "pull_request",
    runId: "123",
    ...overrides,
  };
}

describe("classifyChecks — stuck check runs", () => {
  it("classifies a non-completed run in a COMPLETED suite as failing", () => {
    const [stuck] = classifyChecks([run({ suiteStatus: "COMPLETED" })]);
    expect(stuck!.category).toBe("failing");
    expect(getCiVerdict([stuck!])).toMatchObject({ anyFailing: true, anyInProgress: false });
  });

  it("keeps a non-completed run in a running or unknown suite in progress", () => {
    const classified = classifyChecks([
      run({ suiteStatus: "IN_PROGRESS" }),
      run({ name: "lint", suiteStatus: "QUEUED", status: "QUEUED" }),
      run({ name: "build" }),
    ]);
    expect(classified.map((c) => c.category)).toEqual([
      "in_progress",
      "in_progress",
      "in_progress",
    ]);
  });

  it("does not touch completed runs in a completed suite", () => {
    const [done] = classifyChecks([
      run({ status: "COMPLETED", conclusion: "SUCCESS", suiteStatus: "COMPLETED" }),
    ]);
    expect(done!.category).toBe("passed");
  });

  it("treats a run with a conclusion as completed even when status is IN_PROGRESS (#793)", () => {
    const [done] = classifyChecks([
      run({ name: "checks / migration-order", conclusion: "SUCCESS", suiteStatus: "COMPLETED" }),
    ]);
    expect(done!.category).toBe("passed");
    expect(getCiVerdict([done!])).toMatchObject({ anyFailing: false, anyInProgress: false });
  });

  it("keeps a run with completedAtUnix but no conclusion in progress (not failing)", () => {
    const [r] = classifyChecks([run({ completedAtUnix: 1_779_239_040 })]);
    expect(r!.category).toBe("in_progress");
    expect(getCiVerdict([r!])).toMatchObject({ anyFailing: false, anyInProgress: true });
  });

  it("classifies a non-success conclusion on a non-completed run as failing", () => {
    const [done] = classifyChecks([run({ conclusion: "FAILURE" })]);
    expect(done!.category).toBe("failing");
  });
});
