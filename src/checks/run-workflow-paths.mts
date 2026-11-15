import type { CheckRun } from "../types.mts";
import type { WorkflowSuiteSnapshot } from "./unreported-required.mts";

/**
 * Names the workflow file on checks whose Actions run has not finished, so `triage` can read its
 * `concurrency`. A finished suite is left alone: a stuck check keeps no file line.
 */
export function withRunWorkflowPaths(
  checks: readonly CheckRun[],
  suites: readonly WorkflowSuiteSnapshot[],
): CheckRun[] {
  const paths = new Map<string, string>();
  for (const suite of suites) {
    const run = suite.workflowRun;
    if (suite.status === "COMPLETED" || !run?.path || run.databaseId == null) continue;
    paths.set(String(run.databaseId), run.path);
  }
  return checks.map((check) => {
    const workflowPath = check.runId === null ? undefined : paths.get(check.runId);
    return workflowPath !== undefined && check.status !== "COMPLETED"
      ? { ...check, workflowPath }
      : check;
  });
}
