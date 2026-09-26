/** A check suite slim enough to tell whether an Actions workflow is still running. */
export interface WorkflowSuiteSnapshot {
  status?: string | null;
  conclusion?: string | null;
  workflowRun?: { event?: string | null } | null;
}

/** Required context names that have no check run and no status context. */
export function unreportedRequiredContexts(
  required: readonly string[],
  reported: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const name of required) {
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed) || reported.has(trimmed)) continue;
    seen.add(trimmed);
    missing.push(trimmed);
  }
  return missing;
}

/** Every check or status name on the head. A later success and an older cancel share one name. */
export function reportedCheckNames(checks: readonly { name: string }[]): Set<string> {
  const names = new Set<string>();
  for (const check of checks) {
    const trimmed = check.name.trim();
    if (trimmed) names.add(trimmed);
  }
  return names;
}

/**
 * True when a relevant Actions workflow has not finished.
 * Suites with no workflow run stay queued at third-party apps and do not count.
 */
export function actionsWorkflowInProgress(
  suites: readonly WorkflowSuiteSnapshot[],
  relevantEvents: ReadonlySet<string>,
): boolean {
  return suites.some((suite) => {
    const run = suite.workflowRun;
    if (!run) return false;
    const event = run.event ?? null;
    if (event !== null && event !== "" && !relevantEvents.has(event)) return false;
    if (suite.status != null && suite.status !== "") return suite.status !== "COMPLETED";
    return suite.conclusion == null;
  });
}

/**
 * Native-stack merge requirements come from the trunk, not an upper layer's parent branch.
 * A non-stack PR, or the bottom layer whose base is already the trunk, keeps its own contexts.
 */
export function selectMergeTargetContexts(input: {
  localContexts: readonly string[];
  trunkContexts?: readonly string[];
  baseRefName: string;
  trunkRefName?: string;
}): string[] {
  if (
    input.trunkRefName !== undefined &&
    input.trunkRefName !== input.baseRefName &&
    input.trunkContexts !== undefined
  ) {
    return [...input.trunkContexts];
  }
  return [...input.localContexts];
}
