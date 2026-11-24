import { githubOperation } from "./transport.mts";
import { readRestCheckAnnotations } from "./rest-annotation-read.mts";
import {
  readFreshCheckAnnotations,
  storeCheckAnnotations,
  type AnnotationCacheOptions,
} from "./check-annotation-cache.mts";
import { collectAnnotations, type AnnotationPage } from "./check-annotation-pages.mts";
import type { CheckAnnotation } from "../types.mts";

/**
 * Fetches all inline annotations for one check run.
 *
 * When `cacheOpts` is provided, the result is cached by `checkRunId`. Callers
 * only pass `cacheOpts` for COMPLETED runs (a re-run mints a new node id).
 * Prefer `fetchCheckRunAnnotationsBatch` when attaching many checks at once;
 * this single-node query remains for direct callers and follow-up pages.
 */
export async function fetchCheckRunAnnotations(
  checkRunId: string,
  cacheOpts?: AnnotationCacheOptions,
  initialPage?: AnnotationPage,
): Promise<CheckAnnotation[]> {
  if (initialPage === undefined) {
    const cached = await readFreshCheckAnnotations(checkRunId, cacheOpts);
    if (cached) return cached;
  }
  let skippedNull = false;
  const annotations = await githubOperation(
    "CheckRunAnnotations",
    () =>
      collectAnnotations(checkRunId, initialPage, () => {
        skippedNull = true;
      }),
    () => readRestCheckAnnotations(checkRunId, cacheOpts),
  );
  // A page that held a null entry is incomplete; caching it would hide the entry once it fills in.
  if (!skippedNull) await storeCheckAnnotations(checkRunId, annotations, cacheOpts);
  return annotations;
}
