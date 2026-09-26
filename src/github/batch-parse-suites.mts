import type { WorkflowSuiteSnapshot } from "../checks/unreported-required.mts";
import type { CheckRun } from "../types.mts";
import type { RawPr } from "./batch-raw-types.mts";

export function parseCheckSuitesComplete(raw: RawPr): boolean {
  return raw.commits.nodes[0]?.commit.checkSuites?.pageInfo.hasNextPage === false;
}

/** True only when the head commit's suite page finished and listed nothing. */
export function parseHeadCheckSuitesEmpty(raw: RawPr): boolean {
  const suites = raw.commits.nodes[0]?.commit.checkSuites;
  return suites?.pageInfo.hasNextPage === false && suites.nodes.length === 0;
}

/** Actions suites on the head. Third-party suites with no workflow run are omitted. */
export function parseHeadWorkflowSuites(raw: RawPr): WorkflowSuiteSnapshot[] {
  const nodes = raw.commits.nodes[0]?.commit.checkSuites?.nodes ?? [];
  return nodes.flatMap((node) => {
    if (!node.workflowRun) return [];
    return [
      {
        status: node.status ?? null,
        conclusion: node.conclusion,
        workflowRun: { event: node.workflowRun.event },
      },
    ];
  });
}

export function parseSuiteStartupFailures(raw: RawPr): CheckRun[] {
  const suites = raw.commits.nodes[0]?.commit.checkSuites;
  if (!suites) return [];
  return suites.nodes.flatMap((node) => {
    if (node.conclusion !== "STARTUP_FAILURE" || node.workflowRun == null) return [];
    const runId = node.workflowRun.databaseId != null ? String(node.workflowRun.databaseId) : null;
    const name =
      node.workflowRun.workflow?.name?.trim() || (runId ? `workflow run ${runId}` : "workflow run");
    return [
      {
        name,
        status: "COMPLETED" as const,
        conclusion: "STARTUP_FAILURE" as const,
        source: "startup_failure" as const,
        detailsUrl: node.workflowRun.url ?? "",
        event: node.workflowRun.event,
        runId,
      },
    ];
  });
}
