import type { GraphqlQuotaWarning } from "./types.mts";

export function buildQuotaAwareContinuation(warning: GraphqlQuotaWarning, prefix: string): string {
  const interval = `${warning.pollIntervalMinutes}m`;
  const timeout = `${warning.pollTimeoutMinutes}m`;
  const resetTime = new Date(warning.resetAt * 1000).toISOString();
  const opening =
    warning.resource === "combined"
      ? "GitHub's GraphQL and REST core quotas are both low. Keep using pr-shepherd at the cadence below. Do not shift incidental calls between GraphQL and REST."
      : warning.resource === "core"
        ? `GitHub's REST core quota is low (crossed the ${warning.thresholdPercent}% remaining threshold). Keep using pr-shepherd at the cadence below. Do not add incidental REST \`gh\` calls (\`gh pr view\`, \`gh pr review\`, \`gh api\`) while REST core is below its warning threshold.`
        : `GitHub's GraphQL API quota is low (crossed the ${warning.thresholdPercent}% remaining threshold). Keep using pr-shepherd at the cadence below; for incidental PR operations that do not need Shepherd's full snapshot, prefer non-GraphQL \`gh\` CLI commands (e.g. \`gh pr view\`, \`gh pr review\`, \`gh api\` REST endpoints) — they draw on the separate REST budget, not the depleted GraphQL pool.`;
  const resetLabel =
    warning.resource === "combined"
      ? "both quotas have reset"
      : warning.resource === "core"
        ? "the REST core quota resets"
        : "the GraphQL quota resets";
  return `${prefix} ${opening} Do not substitute \`gh pr checks\` or \`gh pr watch\` for the Shepherd loop. Resume full-cadence pr-shepherd after ${resetLabel} at ${resetTime}. If you must keep polling before then, poll no more often than every ${warning.pollIntervalMinutes} minutes. With a polling CLI command, preserve the other options, raise any shorter interval and timeout flags to at least \`--interval ${interval} --timeout ${timeout}\`, keep any longer cadence, and omit \`--timeout\` when using \`--until-terminal\`. With a single-tick CLI, API, or MCP call, wait at least ${warning.pollIntervalMinutes} minutes before the next tick.`;
}
