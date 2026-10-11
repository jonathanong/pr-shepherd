import { loadDerived, storeDerived, type StateKey } from "../state/rest-cache.mts";
import { graphqlWithRateLimit, type RepoInfo } from "./client.mts";
import type { RawBatchResponse } from "./batch-raw-types.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import { STACK_HANDOFF_CHECK_RUNS_QUERY } from "./queries.mts";
import {
  batchResponseFromSummary,
  checkRunIds,
  summaryComplete,
  type CheckRunDetail,
  type StackHandoffSource,
} from "./stack-handoff-page.mts";
import type { StackRead } from "./stack-read.mts";
import { getGithubTransport } from "./transport.mts";

/**
 * Routed stack layers reuse the stack summary's read.
 *
 * The stack tick that routes owned layers to their one-PR sessions already read
 * each layer's head, reviews, threads, comments, and checks. It stores that
 * read, reshaped into a `BatchPr` first page, under each routed layer. The
 * layer's next `BatchPr` read consumes it once instead of asking GitHub again.
 *
 * Freshness: a handoff is the routing tick's own read of the layer's current
 * head. It is consumed by the first read only, deleted on that read, and
 * ignored once it is older than `HANDOFF_TTL_MS`. Every later read, including
 * the one-PR poll's debounce re-read, asks GitHub.
 *
 * Completeness: a layer gets a handoff only when every window `BatchPr` reads
 * on its first page is complete in the summary. Anything wider, queued, or
 * removed from a queue reads `BatchPr` as before.
 */
const HANDOFF = "stack-handoff";
const HANDOFF_TTL_MS = 2 * 60_000;
const MAX_RUNS_PER_QUERY = 100;

interface StoredHandoff {
  readAt: number;
  headRefOid: string;
  response: RawBatchResponse;
}

interface CheckRunsResponse {
  nodes: Array<({ __typename: string; id?: string } & Partial<CheckRunDetail>) | null>;
}

const stateKey = (repo: RepoInfo, pr: number): StateKey => ({
  owner: repo.owner,
  repo: repo.name,
  pr,
});

/** Snapshot the summary read so later projection cannot change what a handoff carries. */
export function stackHandoffSource(read: StackRead<RawSummaryPr>): StackHandoffSource {
  const { ordered, ...rest } = read;
  return { read: rest, layers: structuredClone(ordered), readAt: Date.now() };
}

/**
 * Store a handoff for each routed layer whose summary is complete. Check-run titles,
 * summaries, and first annotations are not in the summary, so one `nodes(ids:)`
 * read per 100 runs fills them in. Best effort: a failed read stores nothing.
 */
export async function writeStackHandoffs(
  source: StackHandoffSource,
  routed: number[],
  repo: RepoInfo,
): Promise<void> {
  if (getGithubTransport() === "rest") return;
  const candidates = source.layers.filter(
    (layer) => routed.includes(layer.number) && summaryComplete(layer, source),
  );
  for (const layer of source.layers) {
    if (routed.includes(layer.number) && !candidates.includes(layer)) {
      await clearStackHandoff(repo, layer.number);
    }
  }
  if (candidates.length === 0) return;
  const runIds = [...new Set(candidates.flatMap(checkRunIds))];
  let runs: Map<string, CheckRunDetail>;
  try {
    runs = await readCheckRuns(runIds);
  } catch {
    for (const layer of candidates) await clearStackHandoff(repo, layer.number);
    return;
  }
  for (const layer of candidates) {
    const response = batchResponseFromSummary(layer, source, runs);
    if (!response) {
      await clearStackHandoff(repo, layer.number);
      continue;
    }
    const stored: StoredHandoff = {
      readAt: source.readAt,
      headRefOid: layer.headRefOid,
      response,
    };
    await storeDerived(stateKey(repo, layer.number), HANDOFF, stored, layer.headRefOid);
  }
}

/** The stored first page for `pr`, once: the read deletes it. Null when absent or stale. */
export async function takeStackHandoff(
  repo: RepoInfo,
  pr: number,
  now = Date.now(),
): Promise<RawBatchResponse | null> {
  const entry = await loadDerived<StoredHandoff | null>(stateKey(repo, pr), HANDOFF);
  const stored = entry?.value;
  if (!stored) return null;
  await clearStackHandoff(repo, pr);
  const age = now - stored.readAt;
  if (!(age >= 0 && age <= HANDOFF_TTL_MS)) return null;
  const head = stored.response.repository?.pullRequest?.headRefOid;
  if (!head || head !== stored.headRefOid) return null;
  return stored.response;
}

async function clearStackHandoff(repo: RepoInfo, pr: number): Promise<void> {
  const entry = await loadDerived(stateKey(repo, pr), HANDOFF);
  if (entry?.value) await storeDerived(stateKey(repo, pr), HANDOFF, null);
}

async function readCheckRuns(ids: string[]): Promise<Map<string, CheckRunDetail>> {
  const runs = new Map<string, CheckRunDetail>();
  for (let offset = 0; offset < ids.length; offset += MAX_RUNS_PER_QUERY) {
    const chunk = ids.slice(offset, offset + MAX_RUNS_PER_QUERY);
    const result = await graphqlWithRateLimit<CheckRunsResponse>(STACK_HANDOFF_CHECK_RUNS_QUERY, {
      ids: chunk,
    });
    for (const node of result.data.nodes) {
      if (node?.__typename !== "CheckRun" || !node.id || !node.annotations) continue;
      runs.set(node.id, {
        title: node.title ?? null,
        summary: node.summary ?? null,
        annotations: node.annotations,
      });
    }
  }
  return runs;
}
