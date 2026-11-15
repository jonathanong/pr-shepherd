import type { AgentStalledCheck } from "../types.mts";
import { formatDurationApprox } from "../commands/iterate/duration-approx.mts";
import { renderPendingDeploymentLines } from "./pending-deployments-format.mts";

/** Names and URLs come from check providers: keep each inside one code span on one line. */
function inline(text: string): string {
  return text.replace(/[`\r\n]+/g, " ");
}

/** One unstarted check as raw data: a bullet, its summary as a blockquote, and any approvals. */
export function renderStalledCheckLines(check: AgentStalledCheck): string[] {
  const target = check.runId
    ? `run \`${inline(check.runId)}\``
    : check.detailsUrl
      ? `external \`${inline(check.detailsUrl)}\``
      : "no run ID";
  const lines = [
    `- check \`${inline(check.name)}\` — ${check.status} ${check.source}, ${target}, waiting ${formatDurationApprox(check.ageSeconds)}`,
  ];
  if (check.summary) {
    for (const line of check.summary.split(/\r?\n/)) lines.push(`  > ${line}`);
  }
  lines.push(...renderPendingDeploymentLines(check.pendingDeployments, "  "));
  return lines;
}
