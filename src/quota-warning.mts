import type { GraphqlQuotaWarning } from "./types.mts";

export function buildQuotaAwareContinuation(warning: GraphqlQuotaWarning, prefix: string): string {
  const interval = `${warning.pollIntervalMinutes}m`;
  const timeout = `${warning.pollTimeoutMinutes}m`;
  return `${prefix} Continue polling no more often than every ${warning.pollIntervalMinutes} minutes. With the CLI, preserve the other options, replace any existing interval and timeout flags with \`--interval ${interval} --timeout ${timeout}\`, and omit \`--timeout\` when using \`--until-terminal\`. With MCP or single-tick iteration, wait at least ${warning.pollIntervalMinutes} minutes before the next call.`;
}
