import type { ApiResourceUsage, ApiUsage, GraphqlQuotaWarning } from "../types.mts";

function resetTime(resetAt: number): string {
  return new Date(resetAt * 1000).toISOString();
}

function formatResource(resource: ApiResourceUsage): string {
  const used = resource.used === undefined ? "" : ` · used ${resource.used}`;
  return `- \`${resource.resource}\`: ${resource.remaining}/${resource.limit} remaining${used} · ${resource.requestCount} requests · resets ${resetTime(resource.resetAt)}`;
}

export function formatQuotaWarning(warning: GraphqlQuotaWarning | undefined): string | null {
  if (warning === undefined) return null;
  const used = warning.used === undefined ? "" : ` · used ${warning.used}`;
  return [
    "## GitHub API quota warning",
    "",
    `- Resource: \`${warning.resource}\``,
    `- Remaining: ${warning.remaining}/${warning.limit}${used}`,
    `- Crossed threshold: ${warning.thresholdPercent}% remaining`,
    `- Reset: ${resetTime(warning.resetAt)}`,
    `- Recommended poll interval: ${warning.pollIntervalMinutes} minutes`,
    `- Recommended bounded CLI timeout: ${warning.pollTimeoutMinutes} minutes`,
    "- Recommendation: prefer non-GraphQL `gh` CLI commands for PR operations until the reset above, then resume pr-shepherd",
  ].join("\n");
}

export function formatApiUsage(usage: ApiUsage | undefined): string | null {
  if (usage === undefined) return null;
  const lines = ["## GitHub API usage", ""];
  lines.push(
    `- Credential source: ${usage.credentialSources.map((source) => `\`${source}\``).join(", ")}`,
  );
  if (usage.graphql !== undefined) {
    lines.push(formatResource(usage.graphql));
    lines.push(
      `- GraphQL measured cost: ${usage.graphql.measuredQueryCost} · unmeasured requests: ${usage.graphql.unmeasuredRequestCount} · nodes: ${usage.graphql.nodeCount}`,
    );
  }
  for (const resource of usage.rest ?? []) lines.push(formatResource(resource));
  return lines.join("\n");
}
