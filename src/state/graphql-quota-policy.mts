import type { GraphqlQuotaWarningBand } from "../config/load.mts";
import { mostConservativeSample } from "../github/rate-limit-sample.mts";
import type { GraphqlApiUsage, GraphqlQuotaWarning } from "../types.mts";

export interface GraphqlQuotaWarningState {
  resource: string;
  limit: number;
  lastUsed?: number;
  lastRemaining: number;
  resetAt: number;
  warnedThresholds: number[];
  /** Truncated SHA-256 of the credential. Absent in state written before fingerprints. */
  credentialFingerprint?: string;
  // Increments on window rollover, a resource or limit change, or a credential
  // fingerprint change. Claims include it so a real re-arm does not collide
  // with the previous epoch. A stale sample in the same window does not
  // increment it. Optional for state files written before this field existed.
  rearmEpoch?: number;
}

type GraphqlQuotaSample = Pick<
  GraphqlApiUsage,
  "resource" | "limit" | "used" | "remaining" | "resetAt"
> & { credentialFingerprint?: string };

export function evaluateGraphqlQuotaWarning(
  bands: GraphqlQuotaWarningBand[],
  sample: GraphqlQuotaSample,
  previous: GraphqlQuotaWarningState | null,
  observedAt = Date.now() / 1000,
): { warning?: GraphqlQuotaWarning; state: GraphqlQuotaWarningState & { rearmEpoch: number } } {
  const windowRolled =
    previous !== null && sample.resetAt > previous.resetAt && observedAt >= previous.resetAt;
  const rearm =
    previous === null ||
    previous.resource !== sample.resource ||
    previous.limit !== sample.limit ||
    windowRolled ||
    fingerprintChanged(previous, sample);
  // A sample whose own window already ended before the saved one is stale: keep the saved sample.
  const stale =
    previous !== null && sample.resetAt < previous.resetAt && observedAt >= sample.resetAt;
  // Same window: the lowest remaining and the highest used seen so far, so an older sample (or a
  // proxy route whose X-RateLimit-Used disagrees) never lowers the warning level.
  const effective =
    rearm || previous === null
      ? sample
      : stale
        ? savedSample(previous)
        : {
            ...mostConservativeSample(savedSample(previous), sample),
            resetAt: Math.max(previous.resetAt, sample.resetAt),
          };
  const warned = new Set(rearm || previous === null ? [] : previous.warnedThresholds);
  const rearmEpoch = rearm ? (previous?.rearmEpoch ?? 0) + 1 : (previous?.rearmEpoch ?? 0);
  const crossed = bands.filter(
    (band) => effective.remaining * 100 <= effective.limit * band.remainingPercent,
  );
  const newCrossed = crossed.filter((band) => !warned.has(band.remainingPercent));
  for (const band of crossed) warned.add(band.remainingPercent);
  const active = newCrossed.at(-1);
  const credentialFingerprint = sample.credentialFingerprint ?? previous?.credentialFingerprint;
  const state: GraphqlQuotaWarningState & { rearmEpoch: number } = {
    resource: effective.resource,
    limit: effective.limit,
    ...(effective.used !== undefined && { lastUsed: effective.used }),
    lastRemaining: effective.remaining,
    resetAt: effective.resetAt,
    warnedThresholds: bands
      .map((band) => band.remainingPercent)
      .filter((threshold) => warned.has(threshold)),
    ...(credentialFingerprint !== undefined && { credentialFingerprint }),
    rearmEpoch,
  };
  if (active === undefined) return { state };
  return {
    warning: {
      resource: sample.resource === "core" ? "core" : "graphql",
      thresholdPercent: active.remainingPercent,
      remaining: effective.remaining,
      limit: effective.limit,
      ...(effective.used !== undefined && { used: effective.used }),
      resetAt: effective.resetAt,
      pollIntervalMinutes: active.pollIntervalMinutes,
      pollTimeoutMinutes: active.pollIntervalMinutes * 2,
    },
    state,
  };
}

function fingerprintChanged(
  previous: GraphqlQuotaWarningState,
  sample: GraphqlQuotaSample,
): boolean {
  return (
    previous.credentialFingerprint !== undefined &&
    sample.credentialFingerprint !== undefined &&
    previous.credentialFingerprint !== sample.credentialFingerprint
  );
}

function savedSample(previous: GraphqlQuotaWarningState): GraphqlQuotaSample {
  return {
    resource: previous.resource,
    limit: previous.limit,
    ...(previous.lastUsed !== undefined && { used: previous.lastUsed }),
    remaining: previous.lastRemaining,
    resetAt: previous.resetAt,
    ...(previous.credentialFingerprint !== undefined && {
      credentialFingerprint: previous.credentialFingerprint,
    }),
  };
}
