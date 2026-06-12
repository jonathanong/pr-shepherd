import type { ShepherdReport } from "../../types.mts";

type FailingCheck = ShepherdReport["checks"]["failing"][number];
type InProgressCheck = ShepherdReport["checks"]["inProgress"][number];
type InProgressChecks = ShepherdReport["checks"]["inProgress"];

function matchesRerunCheck(failure: FailingCheck, check: InProgressCheck): boolean {
  if (failure.runId !== null && check.runId !== null) {
    return failure.runId === check.runId && failure.name === check.name;
  }
  return failure.runId === null && check.runId === null && failure.name === check.name;
}

function isProtectedByFreshRerun(failure: FailingCheck, check: InProgressCheck): boolean {
  const attemptStartedAt = check.startedAtUnix ?? check.updatedAtUnix ?? check.createdAtUnix;
  return (
    attemptStartedAt !== undefined &&
    matchesRerunCheck(failure, check) &&
    failure.completedAtUnix !== undefined &&
    attemptStartedAt >= failure.completedAtUnix &&
    (failure.startedAtUnix === undefined || failure.startedAtUnix < attemptStartedAt)
  );
}

function hasProtectedFreshRerun(failure: FailingCheck, checks: InProgressChecks): boolean {
  return checks.some((check) => isProtectedByFreshRerun(failure, check));
}

function isProtectedFreshRerun(check: InProgressCheck, failures: FailingCheck[]): boolean {
  const matchingFailures = failures.filter((failure) => matchesRerunCheck(failure, check));
  return (
    matchingFailures.length > 0 &&
    matchingFailures.every((failure) => isProtectedByFreshRerun(failure, check))
  );
}

function protectedFreshRerunIds(report: ShepherdReport): Set<string> {
  return new Set(
    report.checks.inProgress
      .filter((check) => isProtectedFreshRerun(check, report.checks.failing))
      .map((check) => check.runId)
      .filter((id): id is string => id !== null),
  );
}

export function buildAutoCancelRunIds(report: ShepherdReport): string[] {
  return [
    ...new Set(
      report.checks.failing
        .filter((check) => !hasProtectedFreshRerun(check, report.checks.inProgress))
        .map((check) => check.runId)
        .filter((id): id is string => id !== null),
    ),
  ];
}

interface BuildInProgressRunIdOptions {
  suppressProtectedFreshReruns?: boolean;
}

export function buildInProgressRunIds(
  report: ShepherdReport,
  cancelledSet: Set<string>,
  opts: BuildInProgressRunIdOptions = {},
): string[] {
  const protectedRunIds =
    opts.suppressProtectedFreshReruns === false ? new Set() : protectedFreshRerunIds(report);
  return [
    ...new Set(
      report.checks.inProgress
        .map((check) => check.runId)
        .filter(
          (id): id is string => id !== null && !cancelledSet.has(id) && !protectedRunIds.has(id),
        ),
    ),
  ];
}
