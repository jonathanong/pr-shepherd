import type { CheckConclusion, ViewerAuthorization } from "../types.mts";

const NON_FAILING_CONCLUSIONS = new Set<CheckConclusion>(["SUCCESS", "SKIPPED", "NEUTRAL"]);

/** Repository roles GitHub grants `actions: write` to — the exact capability a workflow-run rerun needs. */
const RERUN_CAPABLE_PERMISSIONS = new Set<NonNullable<ViewerAuthorization["repositoryPermission"]>>(
  ["WRITE", "MAINTAIN", "ADMIN"],
);

/**
 * True when the viewer's base-repo role grants GitHub's Actions rerun capability
 * (`actions: write`, which rides with push access). The rerun runs against the base
 * repo where the run lives, so `repositoryPermission` — not `headRepositoryPermission`,
 * which covers fork push access — is the right field to gate on.
 */
export function canRerunWorkflows(auth: ViewerAuthorization | undefined): boolean {
  const permission = auth?.repositoryPermission;
  return permission != null && RERUN_CAPABLE_PERMISSIONS.has(permission);
}

/** True for conclusions that belong under `## Failing checks` (not success/skipped/neutral). */
function isFailingCheckConclusion(
  conclusion: CheckConclusion | undefined,
): conclusion is Exclude<CheckConclusion, "SUCCESS" | "SKIPPED" | "NEUTRAL"> {
  return conclusion == null || !NON_FAILING_CONCLUSIONS.has(conclusion);
}

/** Failing-check rows for formatter/instructions — excludes annotation-only carriers. */
export function isFailingAgentCheck(check: {
  conclusion: CheckConclusion;
  annotationOnly?: boolean;
}): boolean {
  return !check.annotationOnly && isFailingCheckConclusion(check.conclusion);
}
