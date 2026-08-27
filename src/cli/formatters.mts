export { formatIterateResult } from "./iterate-formatter.mts";
export { projectIterateLean, projectIterateVerbose } from "./iterate-lean.mts";
export { formatCleanResult } from "./clean-formatter.mts";
export { formatMarkFilesAsViewedResult } from "./mark-files-as-viewed-formatter.mts";
export { formatMutateResult } from "./mutate-formatter.mts";

import { safeFence } from "./fence.mts";
import type {
  BuildSuggestionPatchesResult,
  CommitSuggestionResult,
  SuggestionPatchResult,
} from "../types.mts";

export function formatSuggestionPatchesResult(result: BuildSuggestionPatchesResult): string {
  const lines = [`Suggestion patches for PR #${result.pr}:`, `  repo: ${result.repo}`];
  result.patches.forEach((patch, index) => {
    lines.push("", ...formatPatch(patch, `## Patch ${index + 1}`).split("\n"));
  });
  appendInstructions(lines, result.postActionInstructions);
  return lines.join("\n");
}

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

function formatPatch(patch: SuggestionPatchResult, heading: string): string {
  const range =
    patch.startLine === patch.endLine
      ? `line ${patch.startLine}`
      : `lines ${patch.startLine}–${patch.endLine}`;
  const lines = [
    heading,
    "",
    `Suggestion from @${patch.author} — thread ${patch.threadId}:`,
    `  ${patch.path} (${range})`,
  ];
  if (patch.patch) {
    const fence = safeFence(patch.patch);
    lines.push("", `${fence}diff`, patch.patch.trimEnd(), fence);
  }
  lines.push("", "### Suggested commit message", "", patch.commitMessage, "", patch.commitBody);
  return lines.join("\n");
}

function appendInstructions(lines: string[], instructions: readonly string[]): void {
  if (instructions.length === 0) return;
  lines.push("", "## Instructions", "");
  instructions.forEach((instruction, index) => {
    lines.push(`${index + 1}. ${instruction}`);
  });
}
