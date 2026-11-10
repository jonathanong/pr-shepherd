import type { ApiResourceUsage, ApiUsage, GithubAppApiUsage, GraphqlApiUsage } from "../types.mts";
import type { TelemetryAggregate } from "./api-telemetry-aggregate.mts";
import type { RateLimitInfo } from "./http-utils.mts";

function orderedSources(selected: TelemetryAggregate): string[] {
  return [...selected.credentialSources.entries()]
    .sort((left, right) => left[1] - right[1])
    .map(([source]) => source);
}

/** Usage of one credential chain: per-resource counts, costs, nodes and quota sample. */
function summarizeChain(
  selected: TelemetryAggregate,
): Pick<ApiUsage, "graphql" | "rest" | "unmeteredRestRequestCount"> {
  const graphql = summarizeGraphql(selected.graphql);
  const rest = summarizeRest(selected.rest);
  const unmeteredRestRequestCount = selected.unmeteredRestRequestCount;
  return {
    ...(graphql !== undefined && { graphql }),
    ...(rest.length > 0 && { rest }),
    ...(unmeteredRestRequestCount > 0 && { unmeteredRestRequestCount }),
  };
}

/** Top level covers the user's token chain only; each GitHub App installation is its own entry. */
export function summarizeAggregate(selected: TelemetryAggregate): ApiUsage | undefined {
  if (selected.eventCount === 0) return undefined;
  const githubApps = [...selected.apps.values()]
    .map((app) => ({ app, first: Math.min(...app.credentialSources.values()) }))
    .sort((left, right) => left.first - right.first)
    .map(({ app }): GithubAppApiUsage => {
      const { graphql, rest } = summarizeChain(app);
      return {
        source: orderedSources(app)[0] as string,
        ...(graphql !== undefined && { graphql }),
        ...(rest !== undefined && { rest }),
      };
    });
  return {
    credentialSources: orderedSources(selected),
    ...summarizeChain(selected),
    ...(githubApps.length > 0 && { githubApps }),
  };
}

function summarizeGraphql(selected: TelemetryAggregate["graphql"]): GraphqlApiUsage | undefined {
  if (selected.rateLimit === undefined) return undefined;
  return {
    ...resourceUsage(selected.rateLimit, selected.requestCount, "graphql"),
    measuredQueryCost: selected.measuredQueryCost,
    unmeasuredRequestCount: selected.unmeasuredRequestCount,
    nodeCount: selected.nodeCount,
  };
}

function summarizeRest(selected: TelemetryAggregate["rest"]): ApiResourceUsage[] {
  return [...selected.entries()].flatMap(([resource, group]) =>
    group.rateLimit
      ? [resourceUsage(group.rateLimit, group.requestCount, resource, group.notModifiedCount)]
      : [],
  );
}

function resourceUsage(
  rateLimit: RateLimitInfo,
  requestCount: number,
  fallbackResource: string,
  notModified = 0,
): ApiResourceUsage {
  return {
    resource: rateLimit.resource ?? fallbackResource,
    ...(requestCount > 0 && { requestCount }),
    ...(notModified > 0 && { notModified }),
    limit: rateLimit.limit,
    ...(rateLimit.used !== undefined && { used: rateLimit.used }),
    remaining: rateLimit.remaining,
    resetAt: rateLimit.resetAt,
  };
}
