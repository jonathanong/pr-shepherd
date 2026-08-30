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

/** Repository roles that carry push access to the head branch. */
const PUSH_CAPABLE_PERMISSIONS = new Set<
  NonNullable<ViewerAuthorization["headRepositoryPermission"]>
>(["WRITE", "MAINTAIN", "ADMIN"]);

/**
 * True when the viewer can push commits to the PR head branch — the fork, for a fork PR
 * (own-fork PRs report `headRepositoryPermission: "ADMIN"`), or the base repo otherwise.
 * `viewerCanEditFiles` is GitHub's direct "can the viewer commit to this PR" signal (true
 * for fork authors and for maintainers with "allow edits from maintainers" enabled) and
 * takes priority when present.
 *
 * pr-shepherd's premise is that the caller has push access to the PR it's iterating, so
 * this defaults to pushable: it withholds the autonomous push only when GitHub
 * affirmatively reports no head-branch access (`viewerCanEditFiles === false` and
 * `headRepositoryPermission` in `NONE`/`READ`/`TRIAGE`). An unverifiable/unknown signal —
 * matching the residual risk already accepted for CI reruns (see `canRerunWorkflows`) —
 * is treated as pushable rather than pre-emptively handed off; a push without access
 * simply fails when attempted.
 */
export function canPushToHead(auth: ViewerAuthorization | undefined): boolean {
  if (auth === undefined) return true;
  if (auth.viewerCanEditFiles === true) return true;
  const permission = auth.headRepositoryPermission;
  if (permission != null && !PUSH_CAPABLE_PERMISSIONS.has(permission)) return false;
  return true;
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
