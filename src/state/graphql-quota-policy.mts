import type { GraphqlQuotaWarningBand } from "../config/load.mts";
import type { GraphqlApiUsage, GraphqlQuotaWarning } from "../types.mts";

export interface GraphqlQuotaWarningState {
  resource: string;
  limit: number;
  lastUsed?: number;
  lastRemaining: number;
  resetAt: number;
  warnedThresholds: number[];
}

export function evaluateGraphqlQuotaWarning(
  bands: GraphqlQuotaWarningBand[],
  sample: Pick<GraphqlApiUsage, "resource" | "limit" | "used" | "remaining" | "resetAt">,
  previous: GraphqlQuotaWarningState | null,
): { warning?: GraphqlQuotaWarning; state: GraphqlQuotaWarningState } {
  const rearm =
    previous === null ||
    previous.resource !== sample.resource ||
    previous.limit !== sample.limit ||
    (sample.used !== undefined && previous.lastUsed !== undefined
      ? sample.used < previous.lastUsed
      : sample.remaining > previous.lastRemaining);
  const warned = new Set(rearm ? [] : previous.warnedThresholds);
  const crossed = bands.filter(
    (band) => sample.remaining * 100 <= sample.limit * band.remainingPercent,
  );
  const newCrossed = crossed.filter((band) => !warned.has(band.remainingPercent));
  for (const band of crossed) warned.add(band.remainingPercent);
  const active = newCrossed.at(-1);
  const state: GraphqlQuotaWarningState = {
    resource: sample.resource,
    limit: sample.limit,
    ...(sample.used !== undefined && { lastUsed: sample.used }),
    lastRemaining: sample.remaining,
    resetAt: sample.resetAt,
    warnedThresholds: bands
      .map((band) => band.remainingPercent)
      .filter((threshold) => warned.has(threshold)),
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
