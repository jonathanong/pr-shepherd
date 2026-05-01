import { renderResolveCommand } from "../commands/iterate.mts";
import { joinSections } from "../util/markdown.mts";
import { renderSuggestionBlock, renderLineRange } from "./suggestion-renderer.mts";
import {
  renderThreadBullet,
  renderCommentBullet,
  renderReviewBullet,
  renderFirstLookStatusTag,
} from "./list-formatters.mts";
import type { IterateResultFixCode } from "../types.mts";

export function formatFixCodeResult(header: string, result: IterateResultFixCode): string {
  const sections: string[] = [header];

  if (result.fix.threads.length > 0) {
    sections.push("## Review threads");
    for (const t of result.fix.threads) {
      const lineLabel = renderLineRange(t.startLine, t.line);
      const loc = t.path ? `\`${t.path}:${lineLabel}\`` : "(no location)";
      const heading = t.url ? `[threadId=${t.id}](${t.url})` : `\`threadId=${t.id}\``;
      const suggestionMarker = t.suggestion ? " [suggestion]" : "";
      sections.push(`### ${heading} — ${loc} (@${t.author})${suggestionMarker}`);
      sections.push(blockquote(t.body));
      if (t.suggestion) {
        sections.push(renderSuggestionBlock(t.suggestion, ""));
      }
    }
  }

  if (result.fix.actionableComments.length > 0) {
    sections.push("## Actionable comments");
    for (const c of result.fix.actionableComments) {
      const heading = c.url ? `[commentId=${c.id}](${c.url})` : `\`commentId=${c.id}\``;
      sections.push(`### ${heading} (@${c.author})`);
      sections.push(blockquote(c.body));
    }
  }

  if (result.fix.checks.length > 0) {
    sections.push("## Failing checks");
    const bullets = result.fix.checks.map((ch) => {
      const workflowPrefix = ch.workflowName ? `${ch.workflowName} › ` : "";
      const jobLabel = ch.jobName ? ch.jobName : ch.name;
      const locator = ch.runId
        ? `\`${ch.runId}\``
        : ch.detailsUrl
          ? `external \`${ch.detailsUrl}\``
          : "(no runId)";
      const conclusionTag = ch.conclusion !== null ? ` [conclusion: ${ch.conclusion}]` : "";
      const lines = [`- ${locator} — \`${workflowPrefix}${jobLabel}\`${conclusionTag}`];
      if (ch.conclusion !== "CANCELLED") {
        if (ch.failedStep) lines.push(`  > ${ch.failedStep}`);
        if (ch.summary) lines.push(`  > ${ch.summary}`);
      }
      return lines.join("\n");
    });
    sections.push(bullets.join("\n\n"));
  }

  if (result.fix.changesRequestedReviews.length > 0) {
    sections.push("## Changes-requested reviews");
    sections.push(result.fix.changesRequestedReviews.map((r) => renderReviewBullet(r)).join("\n"));
  }

  if (result.fix.firstLookSummaries.length > 0) {
    sections.push("## Review summaries (first look — to be minimized)");
    for (const r of result.fix.firstLookSummaries) {
      sections.push(`### \`reviewId=${r.id}\` (@${r.author})`);
      sections.push(r.body.trim() === "" ? "(no review body)" : blockquote(r.body));
    }
  }

  if (result.fix.editedSummaries.length > 0) {
    sections.push(
      "## Review summaries (edited since first look — already minimized; do not re-minimize)",
    );
    for (const r of result.fix.editedSummaries) {
      sections.push(`### \`reviewId=${r.id}\` (@${r.author})`);
      sections.push(r.body.trim() === "" ? "(no review body)" : blockquote(r.body));
    }
  }

  const firstLookSummaryIds = new Set(result.fix.firstLookSummaries.map((r) => r.id));
  const seenSummaryIds = result.fix.reviewSummaryIds.filter((id) => !firstLookSummaryIds.has(id));
  if (seenSummaryIds.length > 0) {
    sections.push("## Review IDs to minimize queue");
    sections.push(seenSummaryIds.map((id) => `- \`${id}\``).join("\n"));
  }

  if (result.fix.surfacedApprovals.length > 0) {
    sections.push("## Approvals (surfaced — not minimized)");
    for (const r of result.fix.surfacedApprovals) {
      sections.push(`### \`reviewId=${r.id}\` (@${r.author})`);
      sections.push(r.body.trim() === "" ? "(no review body)" : blockquote(r.body));
    }
  }

  const firstLookTotal = result.fix.firstLookThreads.length + result.fix.firstLookComments.length;
  if (firstLookTotal > 0) {
    sections.push(
      `## First-look items (${firstLookTotal}) — already closed on GitHub; acknowledge only`,
    );
    const bullets: string[] = [];
    for (const t of result.fix.firstLookThreads) {
      bullets.push(renderThreadBullet(t, { statusTag: renderFirstLookStatusTag(t) }));
    }
    for (const c of result.fix.firstLookComments) {
      const editedSuffix = c.edited ? ", edited" : "";
      bullets.push(renderCommentBullet(c, { statusTag: `[status: minimized${editedSuffix}]` }));
    }
    sections.push(bullets.join("\n"));
  }

  if (result.cancelled.length > 0) {
    sections.push("## Cancelled runs");
    sections.push(result.cancelled.map((id) => `- \`${id}\``).join("\n"));
  }

  sections.push("## Post-fix push");
  const postFixLines = [`- base: \`${result.baseBranch}\``];
  if (result.fix.resolveCommand.hasMutations) {
    postFixLines.push(`- resolve: \`${renderResolveCommand(result.fix.resolveCommand)}\``);
  }
  sections.push(postFixLines.join("\n"));

  sections.push("## Instructions");
  sections.push(result.fix.instructions.map((inst, i) => `${i + 1}. ${inst}`).join("\n"));

  return joinSections(sections);
}

function blockquote(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");
}
