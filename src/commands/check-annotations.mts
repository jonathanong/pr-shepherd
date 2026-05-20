import { fetchCheckRunAnnotations } from "../github/check-annotations.mts";
import type { CheckAnnotation, TriagedCheck } from "../types.mts";

export async function attachUnseenCheckAnnotations(
  checks: TriagedCheck[],
  seenMap: Map<string, { seenAt: number }>,
  prNumber: number,
): Promise<TriagedCheck[]> {
  const checksWithAnnotations: TriagedCheck[] = [];
  for (const check of checks) {
    // eslint-disable-next-line no-await-in-loop
    checksWithAnnotations.push(await attachForCheck(check, seenMap, prNumber));
  }
  return checksWithAnnotations;
}

async function attachForCheck(
  check: TriagedCheck,
  seenMap: Map<string, { seenAt: number }>,
  prNumber: number,
): Promise<TriagedCheck> {
  if (check.id == null) return check;
  let annotations: CheckAnnotation[];
  try {
    annotations = await fetchCheckRunAnnotations(check.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `pr-shepherd: annotation fetch failed for PR #${prNumber} check "${check.name}" (ignored): ${msg}\n`,
    );
    return check;
  }
  const unseen = annotations.filter((a) => !seenMap.has(a.id));
  if (unseen.length === 0) return check;
  return { ...check, annotations: unseen };
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
