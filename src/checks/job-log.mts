import { restText } from "../github/http.mts";
import type { RepoInfo } from "../github/client.mts";
import { loadDerived, storeDerived, type StateKey } from "../state/rest-cache.mts";
import { buildLogExcerpt } from "./log-excerpt.mts";
import type { TriageBudget } from "./triage-budget.mts";

/**
 * `cacheable` gates the cross-tick cache — only set once the matched job has
 * a terminal conclusion, so an in-progress job's (possibly partial) log
 * never gets frozen into the cache.
 */
export async function fetchJobLogExcerpt(
  jobId: number,
  repo: RepoInfo,
  stateKey?: StateKey,
  cacheable = false,
  budget?: TriageBudget,
): Promise<string | undefined> {
  const cacheName = `joblog-v2-${jobId}`;
  if (stateKey && cacheable) {
    const cached = await loadDerived<string | null>(stateKey, cacheName);
    if (cached) return cached.value ?? undefined;
  }
  const { owner, name } = repo;
  try {
    if (!budget?.canScheduleOptional()) return undefined;
    const excerpt = buildLogExcerpt(
      await restText(`/repos/${owner}/${name}/actions/jobs/${jobId}/logs`, (rateLimit) =>
        budget?.observe(rateLimit),
      ),
    );
    if (stateKey && cacheable) {
      await storeDerived<string | null>(stateKey, cacheName, excerpt ?? null);
    }
    return excerpt;
  } catch (error) {
    budget?.observeError(error);
    return undefined;
  }
}
