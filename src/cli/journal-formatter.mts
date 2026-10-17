import type { JournalResult } from "../commands/journal/index.mts";

export function formatJournalResult(result: JournalResult): string {
  if (result.dryRun) {
    const lines = ["Dry run — no body change written."];
    if (result.previewBody !== undefined) {
      lines.push("", result.previewBody);
    }
    return lines.join("\n");
  }
  if (!result.mutated) return "No change — entry already present.";
  if (!result.sectionExisted) {
    return `Created Shepherd Journal details in PR #${result.prNumber}.`;
  }
  return `Appended to Shepherd Journal details in PR #${result.prNumber}.`;
}
