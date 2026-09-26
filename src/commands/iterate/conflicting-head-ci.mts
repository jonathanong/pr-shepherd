/** How long a conflicting head may sit with no CI before Shepherd says none will start. */
const CONFLICTING_HEAD_CI_GRACE_MS = 2 * 60 * 1000;

const NO_CI_NOTE =
  "GitHub did not start pull_request workflows for this conflicting head: no check suites or workflow runs have appeared for at least 2 minutes. Missing CI is a consequence of the conflict, not an outage, and pushing this same head again will not start them.";

export function conflictingHeadCiNote(input: {
  hasConflicts: boolean;
  headCheckSuitesEmpty: boolean;
  checkRunCount: number;
  /** Unix seconds when Shepherd first saw this head. Omit when that time is unknown. */
  firstSeenAtUnix: number | null | undefined;
  nowMs: number;
}): string | undefined {
  if (!input.hasConflicts || !input.headCheckSuitesEmpty || input.checkRunCount > 0) {
    return undefined;
  }
  if (typeof input.firstSeenAtUnix !== "number") return undefined;
  const ageMs = input.nowMs - input.firstSeenAtUnix * 1000;
  if (!Number.isFinite(ageMs) || ageMs < CONFLICTING_HEAD_CI_GRACE_MS) return undefined;
  return NO_CI_NOTE;
}

export function countReportedChecks(checks: {
  passing: readonly unknown[];
  failing: readonly unknown[];
  inProgress: readonly unknown[];
  skipped: readonly unknown[];
  filtered: readonly unknown[];
  ignored?: readonly unknown[];
}): number {
  return (
    checks.passing.length +
    checks.failing.length +
    checks.inProgress.length +
    checks.skipped.length +
    checks.filtered.length +
    (checks.ignored?.length ?? 0)
  );
}

/** Place the missing-CI note with the conflict step, ahead of later repair lines. */
export function insertConflictingHeadCiNote(
  instructions: string[],
  note: string | undefined,
): void {
  if (!note) return;
  const conflictAt = instructions.findIndex((step) => step.includes("merge conflicts"));
  if (conflictAt >= 0) instructions.splice(conflictAt + 1, 0, note);
  else instructions.unshift(note);
}
