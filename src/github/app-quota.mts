import { appendEntry } from "../log/log-file.mts";
import { GitHubRequestError } from "./errors.mts";
import { needsGraphQlQuotaProbe } from "./graphql-quota-probe.mts";
import { rateLimitKind } from "./rate-limit-kind.mts";

export type AppResource = "graphql" | "core";

const APP_SOURCE = /^GitHub App \d+ \(installation (\d+)\)$/;
const FALLBACK_WINDOW_MS = 60_000;

/** `installation:resource` to the epoch milliseconds when GitHub resets that bucket. */
const exhausted = new Map<string, number>();

export function _resetAppQuota(): void {
  exhausted.clear();
}

/** True while the installation's bucket for the resource is empty. */
export function isAppExhausted(installationId: number, resource: AppResource): boolean {
  const until = exhausted.get(`${installationId}:${resource}`);
  return until !== undefined && until > Date.now();
}

/** Primary exhaustion only. Secondary (abuse) limits are never a reason to switch credentials. */
function isPrimaryExhaustion(error: GitHubRequestError): boolean {
  return rateLimitKind(error) === "primary" || needsGraphQlQuotaProbe(error);
}

/**
 * Re-run an app-authenticated request once with the user's token when the installation's own
 * primary limit is spent. `work` re-resolves its credential on every call, so the second run
 * sees the exhaustion mark and uses the user chain until GitHub resets the bucket.
 */
export async function withAppQuotaFallback<T>(
  resource: AppResource,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const installation = APP_SOURCE.exec(
      error instanceof GitHubRequestError ? (error.authSource ?? "") : "",
    )?.[1];
    if (!(error instanceof GitHubRequestError) || !installation || !isPrimaryExhaustion(error)) {
      throw error;
    }
    const resetAt = error.rateLimit?.resetAt;
    const reset = resetAt ? resetAt * 1000 : 0;
    const until = reset > Date.now() ? reset : Date.now() + FALLBACK_WINDOW_MS;
    if (!isAppExhausted(Number(installation), resource)) {
      appendEntry(
        `GitHub App installation ${installation} exhausted its ${resource} rate limit until ${new Date(until).toISOString()}; using the user token.\n`,
      );
    }
    exhausted.set(`${installation}:${resource}`, until);
    return work();
  }
}
