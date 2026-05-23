import type { MarkFilesAsViewedResult } from "../commands/mark-files-as-viewed.mts";

export function formatMarkFilesAsViewedResult(result: MarkFilesAsViewedResult): string {
  const lines: string[] = [];
  lines.push(
    `# PR #${result.prNumber} — Mark files as viewed (${result.markedPaths.length} marked)`,
  );
  lines.push("");
  lines.push(`repo: ${result.repo}`);

  appendPathSection(lines, "Matched files", result.matchedPaths);
  appendPathSection(lines, "Marked viewed", result.markedPaths);
  appendPathSection(lines, "Already viewed", result.alreadyViewedPaths);
  appendPathSection(lines, "Missing from PR diff", result.missingPaths);
  appendTextSection(lines, "Unmatched selectors", result.unmatchedSelectors);

  if (result.rateLimit) {
    const details = [
      result.rateLimit.retryAfterSeconds !== undefined
        ? `retry after ${result.rateLimit.retryAfterSeconds}s`
        : null,
      result.rateLimit.remaining !== undefined && result.rateLimit.limit !== undefined
        ? `remaining ${result.rateLimit.remaining}/${result.rateLimit.limit}`
        : null,
      result.rateLimit.resetAt !== undefined
        ? `reset at ${new Date(result.rateLimit.resetAt * 1000).toISOString()}`
        : null,
    ]
      .filter(Boolean)
      .join(", ");
    lines.push("");
    lines.push(
      `Stopped: GitHub rate limit hit — ${result.rateLimit.message}${details ? ` (${details})` : ""}`,
    );
  }

  appendPathSection(lines, "Not marked due to rate limit", result.unmarkedPaths ?? []);

  const errors = result.rateLimit
    ? result.errors.filter((e) => !e.startsWith("rate limit:"))
    : result.errors;
  appendTextSection(lines, "Errors", errors);

  if (result.matchedPaths.length === 0) {
    lines.push("");
    lines.push("No files matched.");
  }

  return lines.join("\n");
}

function appendPathSection(lines: string[], label: string, paths: string[]): void {
  if (paths.length === 0) return;
  lines.push("");
  lines.push(`## ${label} (${paths.length})`);
  lines.push(paths.map((path) => `- \`${path}\``).join("\n"));
}

function appendTextSection(lines: string[], label: string, values: string[]): void {
  if (values.length === 0) return;
  lines.push("");
  lines.push(`## ${label} (${values.length})`);
  lines.push(values.map((value) => `- ${value}`).join("\n"));
}
