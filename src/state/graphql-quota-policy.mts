import type { GraphqlQuotaWarningBand } from "../config/load.mts";
import type { GraphqlApiUsage, GraphqlQuotaWarning } from "../types.mts";

export interface GraphqlQuotaWarningState {
  resource: string;
  limit: number;
  lastUsed?: number;
  lastRemaining: number;
  resetAt: number;
  warnedThresholds: number[];
  // Increments every time the policy re-arms (window rollover, resource/limit
  // change, or usage dropping while resetAt is unchanged — e.g. a credential
  // switch sharing the same hourly window). Claims key on this so a re-armed
  // warning gets a fresh claim identity instead of colliding with an
  // obsolete claim left over from the prior epoch. Optional for backward
  // compatibility with state files persisted before this field existed.
  rearmEpoch?: number;
}

export function evaluateGraphqlQuotaWarning(
  bands: GraphqlQuotaWarningBand[],
  sample: Pick<GraphqlApiUsage, "resource" | "limit" | "used" | "remaining" | "resetAt">,
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
    (sample.used !== undefined && previous.lastUsed !== undefined
      ? sample.used < previous.lastUsed
      : sample.remaining > previous.lastRemaining);
  const warned = new Set(rearm ? [] : previous.warnedThresholds);
  const rearmEpoch = rearm ? (previous?.rearmEpoch ?? 0) + 1 : (previous?.rearmEpoch ?? 0);
  const crossed = bands.filter(
    (band) => sample.remaining * 100 <= sample.limit * band.remainingPercent,
  );
  const newCrossed = crossed.filter((band) => !warned.has(band.remainingPercent));
  for (const band of crossed) warned.add(band.remainingPercent);
  const active = newCrossed.at(-1);
  const state: GraphqlQuotaWarningState & { rearmEpoch: number } = {
    resource: sample.resource,
    limit: sample.limit,
    ...(sample.used !== undefined && { lastUsed: sample.used }),
    lastRemaining: sample.remaining,
    resetAt: sample.resetAt,
    warnedThresholds: bands
      .map((band) => band.remainingPercent)
      .filter((threshold) => warned.has(threshold)),
    rearmEpoch,
  };
  if (active === undefined) return { state };
  return {
    warning: {
      resource: "graphql",
      thresholdPercent: active.remainingPercent,
      remaining: sample.remaining,
      limit: sample.limit,
      ...(sample.used !== undefined && { used: sample.used }),
      resetAt: sample.resetAt,
      pollIntervalMinutes: active.pollIntervalMinutes,
      pollTimeoutMinutes: active.pollIntervalMinutes * 2,
    },
    state,
  };
}
