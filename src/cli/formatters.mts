export { formatIterateResult } from "./iterate-formatter.mts";
export { projectIterateLean, projectIterateVerbose } from "./iterate-lean.mts";

import { safeFence } from "./fence.mts";
import {
  renderThreadBullet,
  renderCommentBullet,
  renderReviewBullet,
  renderFirstLookStatusTag,
  renderThreadResolutionStatusTag,
} from "./list-formatters.mts";
import { joinSections } from "../util/markdown.mts";
import type { FetchResult } from "../commands/resolve.mts";
import type { CommitSuggestionResult } from "../types.mts";
import type { ResolveResult } from "../comments/resolve.mts";

export function formatFetchResult(result: FetchResult): string {
  const activeTotal =
    result.actionableThreads.length +
    result.resolutionOnlyThreads.length +
    result.actionableComments.length +
    result.changesRequestedReviews.length +
    result.reviewSummaries.length;
  const firstLookTotal = result.firstLookThreads.length + result.firstLookComments.length;
  const total = activeTotal + firstLookTotal;

  const headingParts: string[] = [];
  if (activeTotal > 0) headingParts.push(`${activeTotal} actionable`);
  if (firstLookTotal > 0) headingParts.push(`${firstLookTotal} first-look`);
  const headingSuffix = headingParts.length > 0 ? headingParts.join(", ") : "0 actionable";

  const sections: string[] = [];

  sections.push(`# PR #${result.prNumber} — Resolve fetch (${headingSuffix})`);

  if (result.actionableThreads.length > 0) {
    sections.push(
      `## Actionable Review Threads (${result.actionableThreads.length})` +
        (result.commitSuggestionsEnabled ? " [commit-suggestions: enabled]" : ""),
    );
    sections.push(
      result.actionableThreads
        .map((t) => renderThreadBullet(t, { renderSuggestion: true }))
        .join("\n\n"),
    );
  }

  if (result.resolutionOnlyThreads.length > 0) {
    sections.push(`## Review threads to resolve (${result.resolutionOnlyThreads.length})`);
    sections.push(
      result.resolutionOnlyThreads
        .map((t) => renderThreadBullet(t, { statusTag: renderThreadResolutionStatusTag(t) }))
        .join("\n"),
    );
  }

  if (result.actionableComments.length > 0) {
    sections.push(`## Actionable PR Comments (${result.actionableComments.length})`);
    sections.push(result.actionableComments.map((c) => renderCommentBullet(c)).join("\n"));
  }

  if (result.changesRequestedReviews.length > 0) {
    sections.push(
      `## Pending CHANGES_REQUESTED reviews (${result.changesRequestedReviews.length})`,
    );
    sections.push(result.changesRequestedReviews.map((r) => renderReviewBullet(r)).join("\n"));
  }

  if (result.reviewSummaries.length > 0) {
    sections.push(`## Review summaries (${result.reviewSummaries.length})`);
    sections.push(
      result.reviewSummaries.map((r) => renderReviewBullet(r, { includeBody: true })).join("\n"),
    );
  }

  if (firstLookTotal > 0) {
    sections.push(`## First-look items (${firstLookTotal}) — acknowledge status before acting`);
    const bullets: string[] = [];
    for (const t of result.firstLookThreads) {
      bullets.push(renderThreadBullet(t, { statusTag: renderFirstLookStatusTag(t) }));
    }
    for (const c of result.firstLookComments) {
      const editedSuffix = c.edited ? ", edited" : "";
      bullets.push(renderCommentBullet(c, { statusTag: `[status: minimized${editedSuffix}]` }));
    }
    sections.push(bullets.join("\n"));
  }

  sections.push("## Summary");
  sections.push(
    total === 0
      ? "0 actionable, 0 first-look — all items seen"
      : [
          activeTotal > 0 ? `${activeTotal} actionable` : null,
          firstLookTotal > 0 ? `${firstLookTotal} first-look` : null,
        ]
          .filter(Boolean)
          .join(", "),
  );

  sections.push("## Instructions");
  sections.push(result.instructions.map((inst, i) => `${i + 1}. ${inst}`).join("\n"));

  return joinSections(sections);
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

  lines.push("");
  lines.push("## Suggested commit message");
  lines.push("");
  lines.push(result.commitMessage);
  lines.push("");
  lines.push(result.commitBody);

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
  return lines.join("\n");
}
