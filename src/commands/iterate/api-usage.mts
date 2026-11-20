import { loadConfig } from "../../config/load.mts";
import { summarizeApiTelemetry } from "../../github/api-telemetry.mts";
import { selectQuotaWarning } from "../quota-selection.mts";
import type { ApiUsage, IterateResult } from "../../types.mts";
import { buildQuotaAwareContinuation } from "../../quota-warning.mts";
import { getGithubTransport } from "../../github/transport.mts";
import { isTriageContinuation } from "./check-instructions.mts";
import { scanGhCacheForRateLimit } from "./gh-cache.mts";

function shouldWarn(result: IterateResult): boolean {
  return ["wait", "mark_ready", "merge", "triage"].includes(result.action);
}

/**
 * `gh pr merge` replays a cached GraphQL rate-limit error for 24h. Report it only when Shepherd's
 * own live GraphQL reading shows quota left, which proves the cached error is stale.
 */
function withStaleGhCache(result: IterateResult, apiUsage: ApiUsage): IterateResult {
  if (result.action !== "merge" || result.merge.mode === "rest") return result;
  if ((apiUsage.graphql?.remaining ?? 0) <= 0) return result;
  const ghCacheStaleRateLimit = scanGhCacheForRateLimit();
  if (!ghCacheStaleRateLimit) return result;
  return { ...result, merge: { ...result.merge, ghCacheStaleRateLimit } };
}

export async function attachApiUsage(
  result: IterateResult,
  persistWarning: boolean,
  preservePersistedWarning = false,
  minimumPollIntervalMinutes = 0,
): Promise<IterateResult> {
  const apiUsage = summarizeApiTelemetry();
  if (apiUsage === undefined) return result;

  let quotaWarning = preservePersistedWarning ? result.quotaWarning : undefined;
  const core = apiUsage.rest?.find((item) => item.resource === "core");
  if (quotaWarning === undefined && shouldWarn(result) && (apiUsage.graphql || core)) {
    const [owner, repo] = result.repo.split("/");
    if (owner && repo) {
      const bands = loadConfig().quotaWarningBands.map((band) => ({
        ...band,
        pollIntervalMinutes: Math.max(band.pollIntervalMinutes, minimumPollIntervalMinutes),
      }));
      quotaWarning = await selectQuotaWarning(
        { owner, repo },
        bands,
        apiUsage,
        persistWarning,
        getGithubTransport(),
      );
    }
  }

  const { quotaWarning: _deferredWarning, ...baseResult } = withStaleGhCache(result, apiUsage);
  const withWarning: IterateResult = {
    ...baseResult,
    apiUsage,
    ...(quotaWarning !== undefined && { quotaWarning }),
  };
  if (quotaWarning === undefined || withWarning.action !== "triage") return withWarning;

  const instructions = [...withWarning.triage.instructions];
  const completion = instructions.at(-1);
  if (completion !== undefined) {
    if (isTriageContinuation(completion)) {
      instructions[instructions.length - 1] = buildQuotaAwareContinuation(
        quotaWarning,
        "`[TRIAGE]` is non-terminal. After completing these steps,",
      );
    }
  }
  return { ...withWarning, triage: { ...withWarning.triage, instructions } };
}
