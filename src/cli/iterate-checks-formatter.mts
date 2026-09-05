import type { RelevantCheck } from "../types.mts";
import { renderCheckAnnotation } from "./fix-formatter-extra.mts";

export function formatRelevantChecks(checks: RelevantCheck[]): string | null {
  if (checks.length === 0) return null;
  const lines = ["## Checks", ""];
  for (const check of checks) {
    lines.push(...formatRelevantCheck(check));
  }
  return lines.join("\n");
}

function formatRelevantCheck(check: RelevantCheck): string[] {
  const workflow = check.workflowName ? `${check.workflowName} › ` : "";
  const job = check.jobName ?? check.name;
  const lines = [`- \`${workflow}${job}\` [conclusion: ${check.conclusion}]`];
  appendCheckFields(lines, check);
  appendLogExcerpt(lines, check.logExcerpt);
  appendAnnotations(lines, check.annotations, check.logExcerpt);
  return lines;
}

function appendCheckFields(lines: string[], check: RelevantCheck): void {
  const codeFields = [
    ["run", check.runId],
    ["URL", check.detailsUrl],
    ["scope", check.scope],
    ["commit", check.commitOid],
  ];
  for (const [label, value] of codeFields) {
    if (value) lines.push(`  - ${label}: \`${value}\``);
  }
  const textFields = [
    ["failed step", check.failedStep],
    ["summary", check.summary],
  ];
  for (const [label, value] of textFields) {
    if (value) lines.push(`  - ${label}: ${value}`);
  }
}

function appendLogExcerpt(lines: string[], logExcerpt: string | undefined): void {
  if (!logExcerpt) return;
  for (const line of logExcerpt.split("\n")) lines.push(`  > ${line}`);
}

function appendAnnotations(
  lines: string[],
  annotations: RelevantCheck["annotations"],
  logExcerpt: string | undefined,
): void {
  const rendered = (annotations ?? [])
    .map((a) => renderCheckAnnotation(a, logExcerpt))
    .filter((s): s is string => s !== null);
  if (rendered.length === 0) return;
  lines.push("  - annotations:");
  for (const text of rendered) {
    for (const line of text.split("\n")) lines.push(`    ${line}`);
  }
}
