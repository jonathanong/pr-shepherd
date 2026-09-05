import { blockquote } from "./list-formatters.mts";
import type { CheckAnnotation, IterateResultFixCode } from "../types.mts";

// A bare "Process completed with exit code N." on its own carries nothing beyond
// the check's own [conclusion: FAILURE] tag, so the whole annotation is dropped.
const TRIVIAL_EXIT_CODE_RE = /^Process completed with exit code \d+\.?$/;

/** Returns null when the annotation adds nothing beyond the check's own conclusion tag. */
export function renderCheckAnnotation(a: CheckAnnotation, logExcerpt?: string): string | null {
  const hasRawDetails = a.rawDetails !== undefined && a.rawDetails.trim() !== "";
  const hasTitle = a.title !== undefined && a.title.trim() !== "";
  if (TRIVIAL_EXIT_CODE_RE.test(a.message.trim()) && !hasRawDetails && !hasTitle) return null;

  const loc = `${a.path}:${renderAnnotationRange(a)}`;
  const link = a.blobUrl ? ` [↗](${a.blobUrl})` : "";
  const title = a.title ? ` — ${a.title}` : "";
  const lines = [`- \`${a.id}\`${link} \`${loc}\` [${a.level}]${title}`];
  if (a.message.trim() !== "" && !duplicatesLog(a.message, logExcerpt)) {
    lines.push(blockquote(a.message));
  }
  if (hasRawDetails && !duplicatesLog(a.rawDetails!, logExcerpt)) {
    lines.push(blockquote(a.rawDetails!));
  }
  return lines.join("\n");
}

// The bullet's path:line + blob link already anchors this text; if the identical
// text is also in the check's log excerpt, only the blockquote body is redundant.
function duplicatesLog(text: string, logExcerpt?: string): boolean {
  return logExcerpt !== undefined && logExcerpt.includes(text.trim());
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
