import type { GraphqlQuotaWarningBand } from "../config/load.mts";
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
  const effective =
    !rearm && previous !== null && usageRegressed(previous, sample)
      ? newerSavedSample(previous)
      : sample;
  const warned = new Set(rearm || previous === null ? [] : previous.warnedThresholds);
  const rearmEpoch = rearm ? (previous?.rearmEpoch ?? 0) + 1 : (previous?.rearmEpoch ?? 0);
  const crossed = bands.filter(
    (band) => effective.remaining * 100 <= effective.limit * band.remainingPercent,
  );
  const newCrossed = crossed.filter((band) => !warned.has(band.remainingPercent));
  for (const band of crossed) warned.add(band.remainingPercent);
  const active = newCrossed.at(-1);
  const credentialFingerprint = effective.credentialFingerprint ?? previous?.credentialFingerprint;
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

/** An older observation of the same window: lower used, or higher remaining when used is absent. */
function usageRegressed(previous: GraphqlQuotaWarningState, sample: GraphqlQuotaSample): boolean {
  if (sample.used !== undefined && previous.lastUsed !== undefined) {
    return sample.used < previous.lastUsed;
  }
  return sample.remaining > previous.lastRemaining;
}

function newerSavedSample(previous: GraphqlQuotaWarningState): GraphqlQuotaSample {
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
