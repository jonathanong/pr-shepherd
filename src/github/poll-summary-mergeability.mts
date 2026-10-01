import { getMergeableState, type RepoInfo } from "./client.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

/**
 * Overlay REST mergeability onto an open summary PR whose GraphQL snapshot is `UNKNOWN`, in place.
 *
 * GraphQL keeps reporting `UNKNOWN` while GitHub recomputes mergeability after the
 * base moves; REST `GET /pulls/{n}` triggers that computation and usually answers
 * `dirty` at once. Without this, a layer that just gained a conflict routes as
 * pending until a later tick, matching `iterate`'s `refreshUnknownMergeability`.
 */
export async function refreshUnknownSummaryMergeability(
  raw: RawSummaryPr,
  repo: RepoInfo,
): Promise<void> {
  if (raw.state !== "OPEN") return;
  if (raw.mergeable !== "UNKNOWN" && raw.mergeStateStatus !== "UNKNOWN") return;
  const rest = await getMergeableState(raw.number, repo.owner, repo.name);
  // REST can still be computing; keep a field GraphQL already knew rather than erase it.
  if (rest.mergeable !== "UNKNOWN") raw.mergeable = rest.mergeable;
  if (rest.mergeStateStatus !== "UNKNOWN") raw.mergeStateStatus = rest.mergeStateStatus;
  if (rest.state !== undefined) raw.state = rest.state;
}
