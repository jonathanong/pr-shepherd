import { normalizeWorkflowPath } from "../checks/workflow-path.mts";
import { ACTIONS_APP_SLUG, type WorkflowSuiteSnapshot } from "../checks/unreported-required.mts";
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
function parseHeadWorkflowSuites(raw: RawPr): WorkflowSuiteSnapshot[] {
  const nodes = raw.commits.nodes[0]?.commit.checkSuites?.nodes ?? [];
  return nodes.flatMap((node): WorkflowSuiteSnapshot[] => {
    if (!node.workflowRun) {
      // Actions creates its suites before their runs; keep those so a starting workflow is visible.
      if (node.app?.slug !== ACTIONS_APP_SLUG) return [];
      return [{ status: node.status ?? null, conclusion: node.conclusion, app: node.app }];
    }
    return [
      {
        status: node.status ?? null,
        conclusion: node.conclusion,
        workflowRun: {
          event: node.workflowRun.event,
          databaseId: node.workflowRun.databaseId,
          path: normalizeWorkflowPath(node.workflowRun.file?.path) ?? null,
        },
      },
    ];
  });
}

export function parseSuiteStartupFailures(raw: RawPr): CheckRun[] {
  return startupFailureChecksFromSuites(raw.commits.nodes[0]?.commit.checkSuites);
}

/** One failing check per STARTUP_FAILURE workflow-run suite; shared by the one-PR and summary reads. */
export function startupFailureChecksFromSuites(
  suites:
    | {
        nodes: Array<{
          conclusion: string | null;
          workflowRun: {
            databaseId?: number | null;
            event: string | null;
            url?: string | null;
            workflow?: { name: string | null } | null;
            file?: { path: string | null } | null;
          } | null;
        }>;
      }
    | null
    | undefined,
): CheckRun[] {
  if (!suites) return [];
  return suites.nodes.flatMap((node) => {
    if (node.conclusion !== "STARTUP_FAILURE" || node.workflowRun == null) return [];
    const runId = node.workflowRun.databaseId != null ? String(node.workflowRun.databaseId) : null;
    const name =
      node.workflowRun.workflow?.name?.trim() || (runId ? `workflow run ${runId}` : "workflow run");
    const workflowPath = normalizeWorkflowPath(node.workflowRun.file?.path);
    return [
      {
        name,
        status: "COMPLETED" as const,
        conclusion: "STARTUP_FAILURE" as const,
        source: "startup_failure" as const,
        detailsUrl: node.workflowRun.url ?? "",
        event: node.workflowRun.event,
        runId,
        ...(workflowPath !== undefined && { workflowPath }),
      },
    ];
  });
}

/** `headWorkflowSuites`, omitted when the head has none. */
export function workflowSuites(raw: RawPr): { headWorkflowSuites?: WorkflowSuiteSnapshot[] } {
  const suites = parseHeadWorkflowSuites(raw);
  return suites.length > 0 ? { headWorkflowSuites: suites } : {};
}
