import { joinSections } from "../util/markdown.mts";
import type { CleanResult } from "../commands/clean.mts";

export function formatCleanResult(result: CleanResult): string {
  if (!result.ok) {
    return `Error: ${result.error ?? "unknown error"}`;
  }

  const heading = result.dryRun ? "## Would clean" : "## Cleaned";
  const paths = result.deleted;

  if (result.skipped.length > 0) {
    const label = result.dryRun ? "Nothing to clean (dry-run)" : "Nothing to clean";
    return `${label} — ${result.target} does not exist.`;
  }

  const sections: (string | null)[] = [
    heading,
    paths.map((p) => `- ${p}`).join("\n"),
    result.dryRun
      ? `Would remove ${paths.length} item(s) under ${result.target}`
      : `Removed ${paths.length} item(s) under ${result.target}`,
  ];
  return joinSections(sections);
}
