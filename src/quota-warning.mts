import type { GraphqlQuotaWarning } from "./types.mts";

export function buildQuotaAwareContinuation(warning: GraphqlQuotaWarning, prefix: string): string {
  const interval = `${warning.pollIntervalMinutes}m`;
  const timeout = `${warning.pollTimeoutMinutes}m`;
  const resetTime = new Date(warning.resetAt * 1000).toISOString();
  return `${prefix} GitHub's GraphQL API quota is low (crossed the ${warning.thresholdPercent}% remaining threshold). For the time being, prefer non-GraphQL \`gh\` CLI commands (e.g. \`gh pr view\`, \`gh pr checks\`, \`gh pr review\`, \`gh api\` REST endpoints) for PR operations — they draw on the separate REST budget, not the depleted GraphQL pool. Resume pr-shepherd after the GraphQL quota resets at ${resetTime}. If you must keep polling before then, poll no more often than every ${warning.pollIntervalMinutes} minutes. With a polling CLI command, preserve the other options, replace any existing interval and timeout flags with \`--interval ${interval} --timeout ${timeout}\`, and omit \`--timeout\` when using \`--until-terminal\`. With a single-tick CLI, API, or MCP call, wait at least ${warning.pollIntervalMinutes} minutes before the next tick.`;
}
