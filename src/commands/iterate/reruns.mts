import type { ShepherdReport } from "../../types.mts";
import type { ProtectedRun } from "../../types/protected-run.mts";
import picomatch from "picomatch";

type FailingCheck = ShepherdReport["checks"]["failing"][number];
type InProgressCheck = ShepherdReport["checks"]["inProgress"][number];
type InProgressChecks = ShepherdReport["checks"]["inProgress"];
type CancellableCheck = FailingCheck | InProgressCheck;

interface RunProtection {
  protectedRunIds: Set<string>;
  protectedRuns: ProtectedRun[];
}

interface BuildRunIdOptions {
  protectedRunIds?: Set<string>;
}

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

export function buildAutoCancelRunIdsWithOptions(
  report: ShepherdReport,
  opts: BuildRunIdOptions = {},
): string[] {
  return [
    ...new Set(
      report.checks.failing
        .filter((check) => !hasProtectedFreshRerun(check, report.checks.inProgress))
        .map((check) => check.runId)
        .filter((id): id is string => id !== null && !(opts.protectedRunIds?.has(id) ?? false)),
    ),
  ];
}

interface BuildInProgressRunIdOptions {
  suppressProtectedFreshReruns?: boolean;
  protectedRunIds?: Set<string>;
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
          (id): id is string =>
            id !== null &&
            !cancelledSet.has(id) &&
            !protectedRunIds.has(id) &&
            !(opts.protectedRunIds?.has(id) ?? false),
        ),
    ),
  ];
}

export function buildRunProtection(
  checks: CancellableCheck[],
  patterns: string[] = [],
): RunProtection {
  if (patterns.length === 0) return { protectedRunIds: new Set(), protectedRuns: [] };
  const matchers = patterns.map((pattern) => ({
    pattern,
    isMatch: picomatch(pattern, { nocase: true }),
  }));
  const byRunId = new Map<string, ProtectedRun>();
  for (const check of checks) {
    if (check.runId === null) continue;
    const match = findProtectionMatch(check, matchers);
    if (match === null) continue;
    addProtectedRun(byRunId, check.runId, check, match);
  }
  const protectedRuns = [...byRunId.values()];
  return {
    protectedRunIds: new Set(protectedRuns.map((run) => run.runId)),
    protectedRuns,
  };
}

function addProtectedRun(
  byRunId: Map<string, ProtectedRun>,
  runId: string,
  check: CancellableCheck,
  matchedPattern: string,
): void {
  const existing = byRunId.get(runId);
  if (existing) {
    updateProtectedRun(existing, check);
    return;
  }
  byRunId.set(runId, createProtectedRun(runId, check, matchedPattern));
}

function updateProtectedRun(run: ProtectedRun, check: CancellableCheck): void {
  if (!run.checkNames.includes(check.name)) run.checkNames.push(check.name);
  if (run.workflowName === undefined && check.workflowName !== undefined) {
    run.workflowName = check.workflowName;
  }
}

function createProtectedRun(
  runId: string,
  check: CancellableCheck,
  matchedPattern: string,
): ProtectedRun {
  return {
    runId,
    matchedPattern,
    checkNames: [check.name],
    ...(check.workflowName !== undefined && { workflowName: check.workflowName }),
  };
}

function findProtectionMatch(
  check: CancellableCheck,
  matchers: Array<{ pattern: string; isMatch: (value: string) => boolean }>,
): string | null {
  const candidates = [
    check.workflowName,
    "jobName" in check ? check.jobName : undefined,
    check.name,
  ].filter((value): value is string => value !== undefined && value.trim() !== "");
  for (const matcher of matchers) {
    if (candidates.some((candidate) => matcher.isMatch(candidate))) return matcher.pattern;
  }
  return null;
}
