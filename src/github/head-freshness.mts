import { parseCreatedAt } from "./batch-parser-helpers.mts";

/**
 * When the current head most recently reached GitHub, as the newest of three signals:
 * any check suite on the head (apps create theirs at push time, whatever their app), the latest
 * head-ref force-push, and the PR's own creation. A commit's `committedDate` is not used:
 * a rebased or long-local commit can be old when pushed. Omitted when no signal is known, and
 * the caller must then treat the head as settled.
 */
export function headFreshAtUnix(input: {
  suiteCreatedAts: ReadonlyArray<string | null | undefined>;
  forcePushedAtUnix?: number | undefined;
  prCreatedAt?: string | null | undefined;
}): number | undefined {
  const times = [
    ...input.suiteCreatedAts,
    ...(input.prCreatedAt ? [input.prCreatedAt] : []),
  ].flatMap((raw) => {
    const at = raw ? parseCreatedAt(raw) : 0;
    return at > 0 ? [at] : [];
  });
  if (input.forcePushedAtUnix !== undefined && input.forcePushedAtUnix > 0) {
    times.push(input.forcePushedAtUnix);
  }
  return times.length > 0 ? Math.max(...times) : undefined;
}
