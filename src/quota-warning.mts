import type { GraphqlQuotaWarning } from "./types.mts";

export function buildQuotaAwareContinuation(warning: GraphqlQuotaWarning, prefix: string): string {
  const interval = `${warning.pollIntervalMinutes}m`;
  const timeout = `${warning.pollTimeoutMinutes}m`;
  return `${prefix} Continue polling no more often than every ${warning.pollIntervalMinutes} minutes. With a polling CLI command, preserve the other options, replace any existing interval and timeout flags with \`--interval ${interval} --timeout ${timeout}\`, and omit \`--timeout\` when using \`--until-terminal\`. With a single-tick CLI, API, or MCP call, wait at least ${warning.pollIntervalMinutes} minutes before the next tick.`;
}
