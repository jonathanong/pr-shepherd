import type { GraphqlQuotaWarningBand } from "./config/load.mts";
import type { ApiResourceUsage, GraphqlQuotaWarning, QuotaWarningBudget } from "./types.mts";

type Usage = Pick<ApiResourceUsage, "resource" | "remaining" | "limit" | "used" | "resetAt">;

/** True when this sample is at or below a configured remaining-percent band. */
function budgetBelowBand(
  usage: Pick<Usage, "remaining" | "limit"> | undefined,
  bands: Pick<GraphqlQuotaWarningBand, "remainingPercent">[],
): boolean {
  if (usage === undefined || usage.limit <= 0 || bands.length === 0) return false;
  return bands.some((band) => usage.remaining * 100 <= usage.limit * band.remainingPercent);
}

/**
 * One warning for the budgets that are low on this tick. A GraphQL warning
 * recommends REST only when REST core is still above its bands. When both are
 * low, the result uses the later reset and does not recommend a switch.
 */
export function composeQuotaWarning(input: {
  graphqlWarning?: GraphqlQuotaWarning;
  coreWarning?: GraphqlQuotaWarning;
  graphql?: Usage;
  core?: Usage;
  bands: GraphqlQuotaWarningBand[];
}): GraphqlQuotaWarning | undefined {
  const graphqlBelow = budgetBelowBand(input.graphql, input.bands);
  const coreBelow = budgetBelowBand(input.core, input.bands);
  const graphql = input.graphqlWarning;
  const core = input.coreWarning;
  if (graphql && core) return combineWarnings(graphql, core);
  if (graphql && coreBelow && input.core)
    return combineWarnings(graphql, describeBudget(input.core, input.bands));
  if (core && graphqlBelow && input.graphql) {
    return combineWarnings(core, describeBudget(input.graphql, input.bands));
  }
  return graphql ?? core;
}

function describeBudget(usage: Usage, bands: GraphqlQuotaWarningBand[]): GraphqlQuotaWarning {
  const active = bands
    .filter((band) => usage.remaining * 100 <= usage.limit * band.remainingPercent)
    .reduce((lowest, band) => (band.remainingPercent < lowest.remainingPercent ? band : lowest));
  return {
    resource: usage.resource === "core" ? "core" : "graphql",
    thresholdPercent: active.remainingPercent,
    remaining: usage.remaining,
    limit: usage.limit,
    ...(usage.used !== undefined && { used: usage.used }),
    resetAt: usage.resetAt,
    pollIntervalMinutes: active.pollIntervalMinutes,
    pollTimeoutMinutes: active.pollIntervalMinutes * 2,
  };
}

function combineWarnings(
  left: GraphqlQuotaWarning,
  right: GraphqlQuotaWarning,
): GraphqlQuotaWarning {
  const later = left.resetAt >= right.resetAt ? left : right;
  const interval = Math.max(left.pollIntervalMinutes, right.pollIntervalMinutes);
  return {
    resource: "combined",
    thresholdPercent: Math.min(left.thresholdPercent, right.thresholdPercent),
    remaining: later.remaining,
    limit: later.limit,
    ...(later.used !== undefined && { used: later.used }),
    resetAt: later.resetAt,
    pollIntervalMinutes: interval,
    pollTimeoutMinutes: interval * 2,
    budgets: [toBudget(left), toBudget(right)].sort((a, b) => a.resource.localeCompare(b.resource)),
  };
}

function toBudget(warning: GraphqlQuotaWarning): QuotaWarningBudget {
  return {
    resource: warning.resource === "core" ? "core" : "graphql",
    thresholdPercent: warning.thresholdPercent,
    remaining: warning.remaining,
    limit: warning.limit,
    ...(warning.used !== undefined && { used: warning.used }),
    resetAt: warning.resetAt,
  };
}
