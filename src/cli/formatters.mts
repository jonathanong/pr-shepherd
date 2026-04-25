export { formatIterateResult } from "./iterate-formatter.mts";
export { projectIterateLean } from "./iterate-lean.mts";

import type { FetchResult } from "../commands/resolve.mts";
import type { CommitSuggestionResult } from "../types.mts";
import type { ResolveResult } from "../comments/resolve.mts";

export function formatFetchResult(result: FetchResult): string {
  const total =
    result.actionableThreads.length +
    result.actionableComments.length +
    result.changesRequestedReviews.length +
    result.reviewSummaries.length;

  const sections: string[] = [];

  sections.push(
    `# PR #${result.prNumber} — Resolve fetch (${total === 0 ? "0 actionable" : `${total} actionable`})`,
  );

  if (result.actionableThreads.length > 0) {
    sections.push(
      `## Actionable Review Threads (${result.actionableThreads.length})` +
        (result.commitSuggestionsEnabled ? " [commit-suggestions: enabled]" : ""),
    );
    sections.push(
      result.actionableThreads
        .map((t) => {
          const suggestionMarker = t.suggestion ? " [suggestion]" : "";
          const link = t.url ? ` [↗](${t.url})` : "";
          return `- \`threadId=${t.id}\`${link} \`${t.path ?? ""}:${t.line ?? "?"}\` (@${t.author})${suggestionMarker}: ${t.body.split("\n")[0]?.slice(0, 100) ?? ""}`;
        })
        .join("\n"),
    );
  }

  if (result.actionableComments.length > 0) {
    sections.push(`## Actionable PR Comments (${result.actionableComments.length})`);
    sections.push(
      result.actionableComments
        .map((c) => {
          const link = c.url ? ` [↗](${c.url})` : "";
          return `- \`commentId=${c.id}\`${link} (@${c.author}): ${c.body.split("\n")[0]?.slice(0, 100) ?? ""}`;
        })
        .join("\n"),
    );
  }

  if (result.changesRequestedReviews.length > 0) {
    sections.push(
      `## Pending CHANGES_REQUESTED reviews (${result.changesRequestedReviews.length})`,
    );
    sections.push(
      result.changesRequestedReviews.map((r) => `- \`reviewId=${r.id}\` (@${r.author})`).join("\n"),
    );
  }

  if (result.reviewSummaries.length > 0) {
    sections.push(`## Review summaries (${result.reviewSummaries.length})`);
    sections.push(
      result.reviewSummaries
        .map(
          (r) => `- \`reviewId=${r.id}\` (@${r.author}): ${r.body.split("\n")[0]!.slice(0, 100)}`,
        )
        .join("\n"),
    );
  }

  sections.push("## Summary");
  sections.push(
    total === 0 ? "0 actionable — all threads resolved/minimized" : `${total} actionable item(s)`,
  );

  sections.push("## Instructions");
  sections.push(result.instructions.map((inst, i) => `${i + 1}. ${inst}`).join("\n"));

  return `${sections.join("\n\n")}\n`;
}

export function formatCommitSuggestionResult(result: CommitSuggestionResult): string {
  const lines: string[] = [];

  if (result.dryRun) {
    const range =
      result.startLine === result.endLine
        ? `line ${result.startLine}`
        : `lines ${result.startLine}-${result.endLine}`;
    if (result.valid) {
      lines.push(`Dry-run: would apply suggestion from @${result.author}:`);
      lines.push(`  ${result.path} (${range})`);
    } else {
      lines.push(`Dry-run: suggestion cannot apply cleanly:`);
      lines.push(`- path: ${result.path} (${range})`);
      lines.push(`- author: @${result.author}`);
      lines.push(`- reason: ${result.reason ?? "unknown"}`);
    }
    if (result.patch) {
      lines.push("");
      lines.push("```diff");
      lines.push(result.patch.trimEnd());
      lines.push("```");
    }
  } else if (result.applied) {
    lines.push(`Applied suggestion from @${result.author}:`);
    const range =
      result.startLine === result.endLine
        ? `line ${result.startLine}`
        : `lines ${result.startLine}-${result.endLine}`;
    lines.push(`  ${result.path} (${range})`);
    if (result.commitSha) lines.push(`Commit: ${result.commitSha}`);
    if (result.patch) {
      lines.push("");
      lines.push("```diff");
      lines.push(result.patch.trimEnd());
      lines.push("```");
    }
  } else {
    lines.push(`Failed to apply suggestion ${result.threadId}:`);
    lines.push(`- path: ${result.path} (lines ${result.startLine}–${result.endLine})`);
    lines.push(`- author: @${result.author}`);
    lines.push(`- reason: ${result.reason ?? "unknown"}`);
    if (result.patch) {
      lines.push("");
      lines.push("```diff");
      lines.push(result.patch.trimEnd());
      lines.push("```");
    }
  }

  if (result.postActionInstruction) {
    lines.push("");
    lines.push(result.postActionInstruction);
  }
  return `${lines.join("\n")}\n`;
}

export function formatMutateResult(result: ResolveResult): string {
  const lines: string[] = [];
  if (result.resolvedThreads.length)
    lines.push(
      `Resolved threads (${result.resolvedThreads.length}): ${result.resolvedThreads.join(", ")}`,
    );
  if (result.minimizedComments.length)
    lines.push(
      `Minimized comments (${result.minimizedComments.length}): ${result.minimizedComments.join(", ")}`,
    );
  if (result.dismissedReviews.length)
    lines.push(
      `Dismissed reviews (${result.dismissedReviews.length}): ${result.dismissedReviews.join(", ")}`,
    );
  if (result.errors.length) lines.push(`Errors:\n  ${result.errors.join("\n  ")}`);
  return `${lines.join("\n")}\n`;
}
