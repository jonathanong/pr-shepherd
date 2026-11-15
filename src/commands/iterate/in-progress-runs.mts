import picomatch from "picomatch";
import { loadConfig } from "../../config/load.mts";
import { parseWorkflowConcurrency } from "../../checks/workflow-concurrency.mts";
import type { ClassifiedCheck, InProgressRun, ShepherdReport } from "../../types.mts";
import { readWorkflowFiles, workflowFileKey, type WorkflowFileRequest } from "./workflow-files.mts";

/** Raw `pull_request_target` runs execute the base branch's workflow file, not the head's. */
const BASE_FILE_EVENT = "pull_request_target";

function groupByRun(checks: readonly ClassifiedCheck[]): Map<string, ClassifiedCheck[]> {
  const groups = new Map<string, ClassifiedCheck[]>();
  for (const check of checks) {
    // Actions provenance: a third-party app's check can carry a run-looking id without a workflow.
    if (check.runId === null || check.workflowName === undefined) continue;
    if (check.scope === "merge_group") continue;
    groups.set(check.runId, [...(groups.get(check.runId) ?? []), check]);
  }
  return groups;
}

/** The first `checks.never-cancel` pattern matching the workflow name or any check name. */
function matchedNeverCancel(
  patterns: readonly string[],
  names: readonly string[],
): string | undefined {
  return patterns.find((pattern) => {
    const matches = picomatch(pattern, { nocase: true });
    return names.some((name) => matches(name));
  });
}

function fileRequest(
  report: ShepherdReport,
  group: ClassifiedCheck[],
): WorkflowFileRequest | undefined {
  const path = group.find((check) => check.workflowPath !== undefined)?.workflowPath;
  const baseRead = group[0]?.event === BASE_FILE_EVENT;
  const ref = baseRead ? report.baseBranch : report.headSha;
  return path && ref ? { ref, path, pinned: !baseRead } : undefined;
}

/**
 * In-progress Actions runs on the head, with each workflow's raw `cancel-in-progress` and a
 * `gh run cancel` command only for a run that sets it to the literal `true`. Empty when the
 * feature is off or the PR is in the merge queue (a push would eject it). Reads each workflow
 * file once per call, through one aliased GraphQL read.
 */
export async function buildInProgressRuns(
  report: ShepherdReport,
  rerunAuthorized: boolean,
): Promise<InProgressRun[]> {
  const config = loadConfig();
  if (!config.actions["cancel-runs-before-push"] || report.mergeQueue?.inQueue) return [];
  const groups = groupByRun(report.checks.inProgress);
  if (groups.size === 0) return [];
  const requests = new Map<string, WorkflowFileRequest | undefined>(
    [...groups].map(([runId, group]) => [runId, fileRequest(report, group)]),
  );
  const [owner, name] = report.repo.split("/") as [string, string];
  const files = await readWorkflowFiles(
    { owner, name },
    [...requests.values()].filter(
      (request): request is WorkflowFileRequest => request !== undefined,
    ),
  );
  return [...groups].map(([runId, group]) => {
    const request = requests.get(runId);
    const file = request ? files.get(workflowFileKey(request)) : undefined;
    const parsed = file && "text" in file ? parseWorkflowConcurrency(file.text) : undefined;
    const why = !file ? "no workflow file" : "unreadable" in file ? file.unreadable : "parse error";
    const concurrency = parsed ? parsed.raw : `unreadable (${why})`;
    const workflowName = group[0]!.workflowName!;
    const neverCancel = matchedNeverCancel(config.checks["never-cancel"], [
      workflowName,
      ...group.map((check) => check.name),
    ]);
    const status = group.some((check) => check.status === "WAITING") ? "WAITING" : group[0]!.status;
    const failed = report.checks.failing
      .filter((check) => check.runId === runId)
      .map((check) => check.name);
    const cancel =
      parsed?.cancelInProgress && !neverCancel && status !== "WAITING" && rerunAuthorized;
    return {
      runId,
      workflowName,
      status,
      concurrency,
      ...(failed.length > 0 && { failed, running: group.map((check) => check.name) }),
      ...(neverCancel !== undefined && { neverCancel }),
      ...(cancel && { cancelCommand: `gh run cancel ${runId} -R ${report.repo}` }),
    };
  });
}

/** The first fix step: cancel the superseded runs before editing, only when one has a command. */
export function buildCancelRunsInstruction(runs: readonly InProgressRun[]): string | undefined {
  if (!runs.some((run) => run.cancelCommand)) return undefined;
  return "If any item will need a code change, run every `cancel:` under `## In-progress runs` now, before editing; ignore errors for runs that already finished. If you will push nothing, leave them running.";
}
