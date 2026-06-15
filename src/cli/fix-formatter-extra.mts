import { blockquote } from "./list-formatters.mts";
import type { CheckAnnotation, IterateResultFixCode } from "../types.mts";

export function renderCheckAnnotation(a: CheckAnnotation): string {
  const loc = `${a.path}:${renderAnnotationRange(a)}`;
  const link = a.blobUrl ? ` [↗](${a.blobUrl})` : "";
  const title = a.title ? ` — ${a.title}` : "";
  const lines = [`- \`${a.id}\`${link} \`${loc}\` [${a.level}]${title}`];
  if (a.message.trim() !== "") lines.push(blockquote(a.message));
  if (a.rawDetails !== undefined && a.rawDetails.trim() !== "")
    lines.push(blockquote(a.rawDetails));
  return lines.join("\n");
}

export function renderProtectedRun(
  run: IterateResultFixCode["fix"]["protectedRuns"][number],
): string {
  const label = run.workflowName
    ? `${run.workflowName} (${run.checkNames.join(", ")})`
    : run.checkNames.join(", ");
  return `- \`${run.runId}\` — \`${label}\` [matched: \`${run.matchedPattern}\`]`;
}

function renderAnnotationRange(a: CheckAnnotation): string {
  if (a.startLine === null && a.endLine === null) return "?";
  const start = a.startLine ?? a.endLine;
  const end = a.endLine ?? a.startLine;
  return start === end ? String(start) : `${start}-${end}`;
}
