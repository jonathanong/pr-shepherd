import type { RelevantCheck } from "../types.mts";
import { renderCheckAnnotation } from "./fix-formatter-extra.mts";

export function formatRelevantChecks(checks: RelevantCheck[]): string | null {
  if (checks.length === 0) return null;
  const lines = ["## Checks", ""];
  for (const check of checks) {
    const workflow = check.workflowName ? `${check.workflowName} › ` : "";
    const job = check.jobName ?? check.name;
    lines.push(`- \`${workflow}${job}\` [conclusion: ${check.conclusion}]`);
    if (check.runId) lines.push(`  - run: \`${check.runId}\``);
    if (check.detailsUrl) lines.push(`  - URL: \`${check.detailsUrl}\``);
    if (check.scope) lines.push(`  - scope: \`${check.scope}\``);
    if (check.commitOid) lines.push(`  - commit: \`${check.commitOid}\``);
    if (check.failedStep) lines.push(`  - failed step: ${check.failedStep}`);
    if (check.summary) lines.push(`  - summary: ${check.summary}`);
    if (check.logExcerpt) {
      for (const line of check.logExcerpt.split("\n")) lines.push(`  > ${line}`);
    }
    if (check.annotations && check.annotations.length > 0) {
      lines.push("  - annotations:");
      for (const annotation of check.annotations) {
        for (const line of renderCheckAnnotation(annotation).split("\n")) {
          lines.push(`    ${line}`);
        }
      }
    }
  }
  return lines.join("\n");
}
