import { describe, expect, it } from "vitest";
import type { CheckRun } from "../types.mts";
import { withRunWorkflowPaths } from "./run-workflow-paths.mts";

const check = (over: Partial<CheckRun>): CheckRun => ({
  name: "job",
  status: "IN_PROGRESS",
  conclusion: null,
  detailsUrl: "",
  event: "pull_request",
  runId: "9",
  ...over,
});
const suite = (over: Record<string, unknown> = {}) => ({
  status: "IN_PROGRESS",
  conclusion: null,
  workflowRun: { event: "pull_request", databaseId: 9, path: ".github/workflows/ci.yml" },
  ...over,
});

describe("withRunWorkflowPaths", () => {
  it("names the workflow file on an unfinished check of an unfinished run", () => {
    expect(withRunWorkflowPaths([check({})], [suite()])[0]?.workflowPath).toBe(
      ".github/workflows/ci.yml",
    );
  });

  it("leaves a finished check, a finished suite, and unmatched or id-less checks alone", () => {
    const done = check({ status: "COMPLETED", conclusion: "FAILURE" });
    expect(withRunWorkflowPaths([done], [suite()])[0]).toBe(done);
    const stuck = check({});
    expect(withRunWorkflowPaths([stuck], [suite({ status: "COMPLETED" })])[0]).toBe(stuck);
    const other = check({ runId: "10" });
    expect(withRunWorkflowPaths([other], [suite()])[0]).toBe(other);
    const external = check({ runId: null });
    expect(withRunWorkflowPaths([external], [suite()])[0]).toBe(external);
  });

  it("ignores suites with no workflow run, path or run id", () => {
    const pending = check({});
    expect(
      withRunWorkflowPaths(
        [pending],
        [
          suite({ workflowRun: null }),
          suite({ workflowRun: { databaseId: 9, path: null } }),
          suite({ workflowRun: { path: "a.yml" } }),
        ],
      )[0],
    ).toBe(pending);
  });
});
