import { loadDerived, storeDerived, type StateKey } from "../state/rest-cache.mts";
import type { CheckAnnotation } from "../types.mts";

export interface AnnotationCacheOptions {
  stateKey: StateKey;
  headSha?: string;
}

/**
 * Some Checks-API publishers PATCH additional annotations onto an already
 * COMPLETED check run without minting a new node id, so COMPLETED is not a
 * reliable immutability signal. Bound the cache instead of trusting it forever.
 */
const ANNOTATION_CACHE_MAX_AGE_MS = 60 * 60 * 1000;

function cacheName(checkRunId: string): string {
  return `annotations-${checkRunId}`;
}

export async function readFreshCheckAnnotations(
  checkRunId: string,
  cacheOpts: AnnotationCacheOptions | undefined,
): Promise<CheckAnnotation[] | undefined> {
  if (!cacheOpts) return undefined;
  const cached = await loadDerived<CheckAnnotation[]>(cacheOpts.stateKey, cacheName(checkRunId));
  if (cached && Date.now() - cached.storedAt < ANNOTATION_CACHE_MAX_AGE_MS) return cached.value;
  return undefined;
}

export async function storeCheckAnnotations(
  checkRunId: string,
  annotations: CheckAnnotation[],
  cacheOpts: AnnotationCacheOptions | undefined,
): Promise<void> {
  if (!cacheOpts) return;
  await storeDerived(cacheOpts.stateKey, cacheName(checkRunId), annotations, cacheOpts.headSha);
}
