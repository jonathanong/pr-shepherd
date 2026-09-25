import type { AnnotationCacheOptions } from "../github/check-annotation-cache.mts";
import { fetchCheckRunAnnotationsBatch } from "../github/check-annotations-batch.mts";
import { pollRateLimitRetryAfterMs } from "./poll-quota.mts";
import type { CheckAnnotation, ClassifiedCheck, ShepherdReport, TriagedCheck } from "../types.mts";

function shouldFetchCheckAnnotations(check: ClassifiedCheck): boolean {
  return check.id != null && check.status === "COMPLETED" && check.hasAnnotations === true;
}

function hasActionableAnnotation(check: TriagedCheck): boolean {
  return check.conclusion !== "SUCCESS" && (check.annotations?.length ?? 0) > 0;
}

export function checksWithActionableAnnotations(report: ShepherdReport): TriagedCheck[] {
  return [
    ...report.checks.failing,
    ...report.checks.passing,
    ...report.checks.skipped,
    ...report.checks.filtered,
    ...(report.checks.ignored ?? []),
  ].filter(hasActionableAnnotation);
}

/**
 * True when GitHub itself is already acting on this PR regardless of Shepherd (a failing
 * check, an unseen check-run annotation, or a hard merge conflict) — the categories that
 * `commands/iterate/index.mts` never defers while a PR is queued. Shared with `check.mts` so
 * the seen-marker suppression gate there can't drift from the actual iterate dispatch
 * decision (a queued PR with a failing check still renders review items via `fix_code`; their
 * seen markers must not be suppressed just because the PR happens to be queued).
 */
export function hasCheckDrivenActionableWork(
  checks: {
    failing: TriagedCheck[];
    passing: ClassifiedCheck[];
    skipped: ClassifiedCheck[];
    filtered: ClassifiedCheck[];
    ignored?: TriagedCheck[];
  },
  mergeStatusValue: string,
): boolean {
  return (
    checks.failing.length > 0 ||
    [
      ...checks.failing,
      ...checks.passing,
      ...checks.skipped,
      ...checks.filtered,
      ...(checks.ignored ?? []),
    ].some(hasActionableAnnotation) ||
    mergeStatusValue === "CONFLICTS"
  );
}

export async function attachAndMergeCheckAnnotations(
  buckets: {
    passing: ClassifiedCheck[];
    failing: TriagedCheck[];
    skipped: ClassifiedCheck[];
    filtered: ClassifiedCheck[];
    ignored: ClassifiedCheck[];
  },
  seenMap: Map<string, { seenAt: number }>,
  prNumber: number,
  cacheOpts?: AnnotationCacheOptions,
): Promise<{
  passing: ClassifiedCheck[];
  failing: TriagedCheck[];
  skipped: ClassifiedCheck[];
  filtered: ClassifiedCheck[];
  ignored: ClassifiedCheck[];
}> {
  const candidates = [
    ...buckets.failing,
    ...buckets.passing,
    ...buckets.skipped,
    ...buckets.filtered,
    ...buckets.ignored,
  ].filter(shouldFetchCheckAnnotations);
  const annotated = await attachUnseenCheckAnnotations(candidates, seenMap, prNumber, cacheOpts);
  const byId = new Map(annotated.flatMap((c) => (c.id != null ? [[c.id, c] as const] : [])));
  const apply = <T extends ClassifiedCheck>(list: T[]): T[] =>
    list.map((c) => {
      if (c.id == null) return c;
      const next = byId.get(c.id);
      return next !== undefined ? (next as T) : c;
    });
  return {
    passing: apply(buckets.passing),
    failing: apply(buckets.failing),
    skipped: apply(buckets.skipped),
    filtered: apply(buckets.filtered),
    ignored: apply(buckets.ignored),
  };
}

async function attachUnseenCheckAnnotations(
  checks: ClassifiedCheck[],
  seenMap: Map<string, { seenAt: number }>,
  prNumber: number,
  cacheOpts?: AnnotationCacheOptions,
): Promise<TriagedCheck[]> {
  if (checks.length === 0) return checks;
  const ids = checks.flatMap((check) => (check.id == null ? [] : [check.id]));
  let batch: Awaited<ReturnType<typeof fetchCheckRunAnnotationsBatch>>;
  try {
    batch = await fetchCheckRunAnnotationsBatch(ids, cacheOpts);
  } catch (err) {
    if (pollRateLimitRetryAfterMs(err) !== null) throw err;
    writeAnnotationFailureSummary(prNumber, ids.length, err);
    return checks;
  }
  const firstFailure = batch.failures[0];
  if (firstFailure !== undefined) {
    writeAnnotationFailureSummary(prNumber, batch.failures.length, firstFailure.error);
  }
  return checks.map((check) => withUnseenAnnotations(check, batch.annotations, seenMap));
}

function withUnseenAnnotations(
  check: ClassifiedCheck,
  annotations: Map<string, CheckAnnotation[]>,
  seenMap: Map<string, { seenAt: number }>,
): TriagedCheck {
  const fetched = check.id == null ? undefined : annotations.get(check.id);
  if (fetched === undefined) return check;
  const unseen = fetched.filter((annotation) => !seenMap.has(annotation.id));
  if (unseen.length === 0) return check;
  return { ...check, annotations: unseen };
}

function writeAnnotationFailureSummary(prNumber: number, count: number, err: unknown): void {
  const noun = count === 1 ? "check" : "checks";
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(
    `pr-shepherd: annotation fetch failed for ${count} ${noun} on PR #${prNumber} (ignored): ${message}\n`,
  );
}

export function annotationMarkerBody(a: CheckAnnotation): string {
  return JSON.stringify({
    path: a.path,
    startLine: a.startLine,
    endLine: a.endLine,
    startColumn: a.startColumn,
    endColumn: a.endColumn,
    level: a.level,
    title: a.title,
    message: a.message,
    rawDetails: a.rawDetails,
    blobUrl: a.blobUrl,
  });
}
