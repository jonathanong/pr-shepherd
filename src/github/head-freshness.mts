import { parseCreatedAt } from "./batch-parser-helpers.mts";

/**
 * When the current head most recently reached GitHub, as the newest of three signals:
 * any check suite on the head (apps create theirs at push time, whatever their app), the latest
 * head-ref force-push, the head commit's committer date, and the PR's own creation. The
 * committer date only ever raises the result: an old one (a long-local commit) adds nothing,
 * while a fresh one dates an ordinary push to an old PR that has no suite yet. Omitted when no
 * signal is known, and the caller must then treat the head as settled.
 */
export function headFreshAtUnix(input: {
  suiteCreatedAts: ReadonlyArray<string | null | undefined>;
  forcePushedAtUnix?: number | undefined;
  prCreatedAt?: string | null | undefined;
  committedAt?: string | null | undefined;
}): number | undefined {
  const times = [
    ...input.suiteCreatedAts,
    ...(input.prCreatedAt ? [input.prCreatedAt] : []),
    ...(input.committedAt ? [input.committedAt] : []),
  ].flatMap((raw) => {
    const at = raw ? parseCreatedAt(raw) : 0;
    return at > 0 ? [at] : [];
  });
  if (input.forcePushedAtUnix !== undefined && input.forcePushedAtUnix > 0) {
    times.push(input.forcePushedAtUnix);
  }
  return times.length > 0 ? Math.max(...times) : undefined;
}
