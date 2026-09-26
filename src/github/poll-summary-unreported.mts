import { loadConfig } from "../config/load.mts";
import {
  actionsWorkflowInProgress,
  selectMergeTargetContexts,
  unreportedRequiredContexts,
} from "../checks/unreported-required.mts";
import { parseBranchRules } from "./batch-parsers-rules.mts";
import type { PollSummaryChecks } from "../types.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

/** Required contexts from the open layer whose base is the stack trunk. */
export function trunkRequiredContexts(ordered: readonly RawSummaryPr[]): string[] | undefined {
  const trunk = ordered.find((pr) => pr.stack)?.stack?.baseRefName;
  if (!trunk) return undefined;
  const bottom = ordered.find((pr) => pr.state === "OPEN" && pr.baseRefName === trunk);
  if (!bottom) return undefined;
  return parseBranchRules(bottom.baseRef).requiredStatusCheckContexts;
}

/** Record missing required contexts. A running Actions workflow does not clear the names. */
export function applyUnreportedRequiredChecks(
  raw: RawSummaryPr,
  checks: PollSummaryChecks,
  mergeTargetContexts: readonly string[] | undefined,
): void {
  const trunk = raw.stack?.baseRefName;
  const required = selectMergeTargetContexts({
    localContexts: parseBranchRules(raw.baseRef).requiredStatusCheckContexts,
    ...(mergeTargetContexts !== undefined && { trunkContexts: mergeTargetContexts }),
    baseRefName: raw.baseRefName,
    ...(trunk !== undefined && mergeTargetContexts !== undefined && { trunkRefName: trunk }),
  });
  const missing = unreportedRequiredContexts(required, reportedNames(raw));
  if (missing.length === 0) return;
  checks.unreportedRequired = missing;
  const suites = raw.commits.nodes[0]?.commit.checkSuites?.nodes ?? [];
  if (actionsWorkflowInProgress(suites, new Set(loadConfig().checks.ciTriggerEvents))) {
    checks.actionsWorkflowInProgress = true;
  }
}

function reportedNames(raw: RawSummaryPr): Set<string> {
  const names = new Set<string>();
  const rollups = [
    raw.commits.nodes[0]?.commit.statusCheckRollup,
    raw.mergeQueueEntry?.headCommit?.statusCheckRollup,
  ];
  for (const rollup of rollups) {
    for (const node of rollup?.contexts.nodes ?? []) {
      if (!node) continue;
      const name = node.__typename === "CheckRun" ? node.name : node.context;
      if (typeof name !== "string") continue;
      const trimmed = name.trim();
      if (trimmed) names.add(trimmed);
    }
  }
  return names;
}
