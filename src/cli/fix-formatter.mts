import { renderResolveCommand } from "../commands/iterate/render.mts";
import { joinSections } from "../util/markdown.mts";
import { renderSuggestionBlock, renderLineRange } from "./suggestion-renderer.mts";
import {
  renderThreadBullet,
  renderReviewBullet,
  renderThreadResolutionStatusTag,
  renderAuthor,
  buildFirstLookBullets,
  renderThreadConversation,
  blockquote,
} from "./list-formatters.mts";
import { numberInstructions } from "./iterate-instructions.mts";
import type { CheckAnnotation, IterateResultFixCode } from "../types.mts";

export function formatFixCodeResult(header: string, result: IterateResultFixCode): string {
  const sections: string[] = [header];

  if (result.fix.threads.length > 0) {
    sections.push("## Review threads");
    for (const t of result.fix.threads) {
      const lineLabel = renderLineRange(t.startLine, t.line);
      const loc = t.path ? `\`${t.path}:${lineLabel}\`` : "(no location)";
      const heading = t.url ? `[threadId=${t.id}](${t.url})` : `\`threadId=${t.id}\``;
      const reviewMarker = t.reviewId ? ` [reviewId=${t.reviewId}]` : "";
      const suggestionMarker = t.suggestion ? " [suggestion]" : "";
      const editedMarker = t.edited ? " [edited since first look]" : "";
      sections.push(
        `### ${heading} — ${loc} (${renderAuthor(t.author, t.authorType)})${reviewMarker}${suggestionMarker}${editedMarker}`,
      );
      sections.push(renderThreadConversation(t));
      if (t.suggestion) {
        sections.push(renderSuggestionBlock(t.suggestion, ""));
      }
    }
  }

  if (result.fix.resolutionOnlyThreads.length > 0) {
    sections.push("## Review threads to resolve");
    sections.push(
      result.fix.resolutionOnlyThreads
        .map((t) => renderThreadBullet(t, { statusTag: renderThreadResolutionStatusTag(t) }))
        .join("\n"),
    );
  }

  if (result.fix.actionableComments.length > 0) {
    sections.push("## Actionable comments");
    for (const c of result.fix.actionableComments) {
      const heading = c.url ? `[commentId=${c.id}](${c.url})` : `\`commentId=${c.id}\``;
      const editedMarker = c.edited ? " [edited since first look]" : "";
      sections.push(`### ${heading} (${renderAuthor(c.author, c.authorType)})${editedMarker}`);
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
        if (ch.logExcerpt) lines.push(indentBlockquote(ch.logExcerpt, "  "));
      }
      return lines.join("\n");
    });
    sections.push(bullets.join("\n\n"));
  }

  const checksWithAnnotations = result.fix.checks.filter((ch) => (ch.annotations?.length ?? 0) > 0);
  if (checksWithAnnotations.length > 0) {
    sections.push("## Check annotations");
    for (const ch of checksWithAnnotations) {
      const workflowPrefix = ch.workflowName ? `${ch.workflowName} › ` : "";
      const jobLabel = ch.jobName ? ch.jobName : ch.name;
      const locator = ch.runId
        ? `\`${ch.runId}\``
        : ch.detailsUrl
          ? `external \`${ch.detailsUrl}\``
          : "(no runId)";
      sections.push(`### ${locator} — \`${workflowPrefix}${jobLabel}\``);
      sections.push(ch.annotations!.map(renderCheckAnnotation).join("\n\n"));
    }
  }

  if (result.fix.changesRequestedReviews.length > 0) {
    sections.push("## Changes-requested reviews");
    sections.push(result.fix.changesRequestedReviews.map((r) => renderReviewBullet(r)).join("\n"));
  }

  if (result.fix.firstLookSummaries.length > 0) {
    sections.push("## Review summaries (first look)");
    for (const r of result.fix.firstLookSummaries) {
      sections.push(`### \`reviewId=${r.id}\` (${renderAuthor(r.author, r.authorType)})`);
      sections.push(r.body.trim() === "" ? "(no review body)" : blockquote(r.body));
    }
  }

  if (result.fix.editedSummaries.length > 0) {
    sections.push(
      "## Review summaries (edited since first look — already minimized; do not re-minimize)",
    );
    for (const r of result.fix.editedSummaries) {
      sections.push(`### \`reviewId=${r.id}\` (${renderAuthor(r.author, r.authorType)})`);
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
      sections.push(`### \`reviewId=${r.id}\` (${renderAuthor(r.author, r.authorType)})`);
      sections.push(r.body.trim() === "" ? "(no review body)" : blockquote(r.body));
    }
  }

  const firstLookTotal = result.fix.firstLookThreads.length + result.fix.firstLookComments.length;
  if (firstLookTotal > 0) {
    sections.push(`## First-look items (${firstLookTotal}) — acknowledge status before acting`);
    const resolutionOnlyIds = new Set(result.fix.resolutionOnlyThreads.map((t) => t.id));
    sections.push(
      buildFirstLookBullets(
        result.fix.firstLookThreads,
        resolutionOnlyIds,
        result.fix.firstLookComments,
      ).join("\n"),
    );
  }

  if (result.fix.inProgressRunIds.length > 0) {
    sections.push("## In-progress runs");
    sections.push(result.fix.inProgressRunIds.map((id) => `- \`${id}\``).join("\n"));
  }

  if (result.cancelled.length > 0) {
    sections.push("## Cancelled runs");
    sections.push(result.cancelled.map((id) => `- \`${id}\``).join("\n"));
  }

  sections.push("## Post-fix push");
  const postFixLines = [`- base: \`${result.baseBranch}\``];
  if (result.fix.resolveOnlyCommand?.hasMutations)
    postFixLines.push(`- resolve-only: \`${renderResolveCommand(result.fix.resolveOnlyCommand)}\``);
  if (result.fix.resolveCommand.hasMutations) {
    postFixLines.push(`- resolve: \`${renderResolveCommand(result.fix.resolveCommand)}\``);
  }
  sections.push(postFixLines.join("\n"));

  sections.push("## Instructions");
  sections.push(numberInstructions(result.fix.instructions));

  return joinSections(sections);
}

function renderCheckAnnotation(a: CheckAnnotation): string {
  const loc = `${a.path}:${renderAnnotationRange(a)}`;
  const link = a.blobUrl ? ` [↗](${a.blobUrl})` : "";
  const title = a.title ? ` — ${a.title}` : "";
  const lines = [`- \`${a.id}\`${link} \`${loc}\` [${a.level}]${title}`];
  if (a.message.trim() !== "") lines.push(blockquote(a.message));
  if (a.rawDetails !== undefined && a.rawDetails.trim() !== "")
    lines.push(blockquote(a.rawDetails));
  return lines.join("\n");
}

function indentBlockquote(body: string, indent: string): string {
  return blockquote(body)
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
}

function renderAnnotationRange(a: CheckAnnotation): string {
  if (a.startLine === null && a.endLine === null) return "?";
  const start = a.startLine ?? a.endLine;
  const end = a.endLine ?? a.startLine;
  if (start === end) return String(start);
  return `${start}-${end}`;
}
