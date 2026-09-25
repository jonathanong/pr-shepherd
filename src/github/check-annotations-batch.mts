import { pollRateLimitRetryAfterMs } from "../commands/poll-quota.mts";
import type { CheckAnnotation } from "../types.mts";
import {
  readFreshCheckAnnotations,
  type AnnotationCacheOptions,
} from "./check-annotation-cache.mts";
import { type RawCheckAnnotation } from "./check-annotation-shape.mts";
import { fetchCheckRunAnnotations } from "./check-annotations.mts";
import { graphql } from "./client.mts";
import { CHECK_RUN_ANNOTATIONS_BATCH_QUERY } from "./queries.mts";

/**
 * One `nodes` connection plus one nested `annotations(first: 100)` per id.
 * 20 ids are 21 connection-requests, which GitHub prices as 1 point.
 */
const ANNOTATION_BATCH_CHUNK_SIZE = 20;

interface AnnotationBatchFailure {
  checkRunId: string;
  error: unknown;
}

interface CheckAnnotationBatchResult {
  annotations: Map<string, CheckAnnotation[]>;
  failures: AnnotationBatchFailure[];
}

interface RawBatchNode {
  id?: string;
  __typename?: string;
  annotations?: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: RawCheckAnnotation[];
  };
}

function chunksOf<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function retryableRateLimit(err: unknown): boolean {
  return pollRateLimitRetryAfterMs(err) !== null;
}

/**
 * First annotation page for every uncached id, in chunks of 20. Further pages
 * use the single-node query and only run when that first page has `hasNextPage`.
 * A retryable rate limit aborts the remaining chunks and pages.
 */
export async function fetchCheckRunAnnotationsBatch(
  checkRunIds: string[],
  cacheOpts?: AnnotationCacheOptions,
): Promise<CheckAnnotationBatchResult> {
  const annotations = new Map<string, CheckAnnotation[]>();
  const failures: AnnotationBatchFailure[] = [];
  const cached = await Promise.all(
    checkRunIds.map((id) => readFreshCheckAnnotations(id, cacheOpts)),
  );
  const uncached: string[] = [];
  checkRunIds.forEach((id, index) => {
    const hit = cached[index];
    if (hit) annotations.set(id, hit);
    else uncached.push(id);
  });
  for (const chunk of chunksOf(uncached, ANNOTATION_BATCH_CHUNK_SIZE)) {
    // eslint-disable-next-line no-await-in-loop
    await fetchChunk(chunk, annotations, failures, cacheOpts);
  }
  return { annotations, failures };
}

async function fetchChunk(
  chunk: string[],
  annotations: Map<string, CheckAnnotation[]>,
  failures: AnnotationBatchFailure[],
  cacheOpts: AnnotationCacheOptions | undefined,
): Promise<void> {
  try {
    const nodes = await requestFirstPages(chunk);
    await applyBatchNodes(chunk, nodes, annotations, failures, cacheOpts);
  } catch (err) {
    if (retryableRateLimit(err)) throw err;
    // A non-rate-limit batch failure (one NOT_FOUND or FORBIDDEN node rejects
    // the whole `nodes(ids:)` request) must not drop the other ids.
    await fetchChunkOneByOne(chunk, annotations, failures, cacheOpts);
  }
}

async function applyBatchNodes(
  chunk: string[],
  nodes: Array<RawBatchNode | null>,
  annotations: Map<string, CheckAnnotation[]>,
  failures: AnnotationBatchFailure[],
  cacheOpts: AnnotationCacheOptions | undefined,
): Promise<void> {
  for (const id of chunk) {
    const node = nodes.find((candidate) => candidate?.id === id) ?? null;
    if (node?.__typename !== "CheckRun" || node.annotations === undefined) {
      failures.push({ checkRunId: id, error: new Error("check run annotations unavailable") });
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      annotations.set(id, await fetchCheckRunAnnotations(id, cacheOpts, node.annotations));
    } catch (err) {
      if (retryableRateLimit(err)) throw err;
      failures.push({ checkRunId: id, error: err });
    }
  }
}

async function fetchChunkOneByOne(
  chunk: string[],
  annotations: Map<string, CheckAnnotation[]>,
  failures: AnnotationBatchFailure[],
  cacheOpts: AnnotationCacheOptions | undefined,
): Promise<void> {
  for (const id of chunk) {
    try {
      // eslint-disable-next-line no-await-in-loop
      annotations.set(id, await fetchCheckRunAnnotations(id, cacheOpts));
    } catch (err) {
      if (retryableRateLimit(err)) throw err;
      failures.push({ checkRunId: id, error: err });
    }
  }
}

async function requestFirstPages(ids: string[]): Promise<Array<RawBatchNode | null>> {
  const res = await graphql<{ nodes: Array<RawBatchNode | null> | null }>(
    CHECK_RUN_ANNOTATIONS_BATCH_QUERY,
    { ids },
    { allowPartialData: true },
  );
  return res.data.nodes ?? [];
}
