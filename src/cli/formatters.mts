export { formatIterateResult } from "./iterate-formatter.mts";
export { projectIterateLean, projectIterateVerbose } from "./iterate-lean.mts";
export { formatCleanResult } from "./clean-formatter.mts";
export { formatMarkFilesAsViewedResult } from "./mark-files-as-viewed-formatter.mts";
export { formatMutateResult } from "./mutate-formatter.mts";

import { safeFence } from "./fence.mts";
import type { CommitSuggestionResult } from "../types.mts";

export function formatCommitSuggestionResult(result: CommitSuggestionResult): string {
  const lines: string[] = [];
  const range =
    result.startLine === result.endLine
      ? `line ${result.startLine}`
      : `lines ${result.startLine}–${result.endLine}`;

  lines.push(`Suggestion from @${result.author} for PR #${result.pr} — thread ${result.threadId}:`);
  lines.push(`  repo: ${result.repo}`);
  lines.push(`  ${result.path} (${range})`);

  if (result.patch) {
    const fence = safeFence(result.patch);
    lines.push("");
    lines.push(`${fence}diff`);
    lines.push(result.patch.trimEnd());
    lines.push(fence);
  }

  lines.push("", "## Suggested commit message", "", result.commitMessage, "", result.commitBody);

  if (result.postActionInstructions.length > 0) {
    lines.push("");
    lines.push("## Instructions");
    lines.push("");
    result.postActionInstructions.forEach((inst, i) => {
      lines.push(`${i + 1}. ${inst}`);
    });
  }
  return lines.join("\n");
}
