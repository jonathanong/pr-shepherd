import type { CheckRun } from "../types.mts";
import type { RawPr } from "./batch-raw-types.mts";

export function parseCheckSuitesComplete(raw: RawPr): boolean {
  const suites = raw.commits.nodes[0]?.commit.checkSuites;
  return suites != null && suites.pageInfo.hasNextPage === false;
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
