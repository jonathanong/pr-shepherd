/* eslint-disable max-lines */
import { inlineCode, joinSections } from "../util/markdown.mts";
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
import { BODY_TRUNCATE_MAX_CHARS } from "./body-truncate.mts";
import { numberInstructions } from "./iterate-instructions.mts";
import { renderCheckAnnotation } from "./triage-formatter-extra.mts";
import { renderRelatedJobLines } from "./related-jobs-format.mts";
import { isFailingAgentCheck } from "../checks/conclusions.mts";
import type { IterateResultTriage } from "../types.mts";
import { renderMergeCommand } from "../commands/iterate/merge.mts";
import { partitionFixThreads } from "../commands/iterate/fix-instruction-threads.mts";

export function formatTriageResult(
  header: string,
  result: IterateResultTriage,
  opts: { verbose?: boolean } = {},
): string {
  const verbose = opts.verbose ?? false;
  const topCap = verbose ? undefined : BODY_TRUNCATE_MAX_CHARS;
  const sections: string[] = [header];

  if (result.mergedBasePullRequests?.length) {
    sections.push("## Merged PRs matching the current base");
    sections.push(
      result.mergedBasePullRequests
        .map(
          (pr) =>
            `- [#${pr.number}](${pr.url}) · state \`${pr.state}\` · head \`${pr.headRefName}\` at \`${pr.headRefOid}\` · base \`${pr.baseRefName}\` · mergedAt \`${pr.mergedAt}\` · headRepository \`${pr.headRepository.nameWithOwner}\``,
        )
        .join("\n"),
    );
  }

  const renderThreads = (heading: string, threads: typeof result.triage.threads): void => {
    if (threads.length === 0) return;
    sections.push(heading);
    for (const t of threads) {
      const lineLabel = renderLineRange(t.startLine, t.line);
      const loc = t.path ? `\`${t.path}:${lineLabel}\`` : "(no location)";
      const heading = t.url ? `[threadId=${t.id}](${t.url})` : `\`threadId=${t.id}\``;
      const reviewMarker = t.reviewId ? ` [reviewId=${t.reviewId}]` : "";
      const suggestionMarker = t.suggestion ? " [suggestion]" : "";
      const editedMarker = t.edited ? " [edited since first look]" : "";
      sections.push(
        `### ${heading} — ${loc} (${renderAuthor(t.author, t.authorType, t.authorAssociation, t.viewerDidAuthor)})${reviewMarker}${suggestionMarker}${editedMarker}`,
      );
      sections.push(renderThreadConversation(t, verbose));
      if (t.suggestion) {
        sections.push(renderSuggestionBlock(t.suggestion, ""));
      }
    }
  };
  const { locatedThreads, unlocatedMutatedThreads, unlocatedThreads } = partitionFixThreads(
    result.triage.threads,
    result.triage.resolveCommand,
    result.triage.resolveOnlyCommand,
  );
  renderThreads("## Review threads", [...locatedThreads, ...unlocatedMutatedThreads]);
  renderThreads("## Unlocated review threads (logged once — no mutation)", unlocatedThreads);

  if (result.triage.resolutionOnlyThreads.length > 0) {
    sections.push("## Review threads to resolve");
    sections.push(
      result.triage.resolutionOnlyThreads
        .map((t) =>
          renderThreadBullet(t, { statusTag: renderThreadResolutionStatusTag(t), verbose }),
        )
        .join("\n"),
    );
  }

  if (result.triage.actionableComments.length > 0) {
    sections.push("## Actionable comments");
    for (const c of result.triage.actionableComments) {
      const heading = c.url ? `[commentId=${c.id}](${c.url})` : `\`commentId=${c.id}\``;
      const editedMarker = c.edited ? " [edited since first look]" : "";
      const authorizationMarker = c.viewerCanMinimize === false ? " [viewer cannot minimize]" : "";
      sections.push(
        `### ${heading} (${renderAuthor(c.author, c.authorType, c.authorAssociation)})${authorizationMarker}${editedMarker}`,
      );
      sections.push(blockquote(c.body, topCap, c.url));
    }
  }

  const failingChecks = result.triage.checks.filter((ch) => isFailingAgentCheck(ch));
  if (failingChecks.length > 0) {
    sections.push("## Failing checks");
    // Multiple failing CheckRuns (matrix jobs, etc.) can share one runId; the rerun command is
    // identical for all of them, so print it once — after the first bullet for that runId —
    // instead of repeating the same shell command on every row.
    const seenRerunRunIds = new Set<string>();
    const bullets = failingChecks.map((ch) => {
      const workflowPrefix = ch.workflowName ? `${ch.workflowName} › ` : "";
      const jobLabel = ch.jobName ? ch.jobName : ch.name;
      const locator = ch.runId
        ? `\`${ch.runId}\``
        : ch.detailsUrl
          ? `external \`${ch.detailsUrl}\``
          : "(no runId)";
      const conclusionTag = ch.conclusion !== null ? ` [conclusion: ${ch.conclusion}]` : "";
      const attemptTag = ch.runAttempt !== undefined ? ` [attempt: ${ch.runAttempt}]` : "";
      const scopeTag = ch.scope
        ? ` [scope: ${ch.scope}${ch.commitOid ? `, commit: ${ch.commitOid}` : ""}]`
        : "";
      const lines = [
        `- ${locator} — \`${workflowPrefix}${jobLabel}\`${conclusionTag}${attemptTag}${scopeTag}`,
      ];
      if (ch.conclusion !== "CANCELLED") {
        if (ch.failedStep) lines.push(`  > ${ch.failedStep}`);
        if (ch.summary) lines.push(`  > ${ch.summary}`);
        if (ch.logExcerpt) lines.push(indentBlockquote(ch.logExcerpt, "  "));
        lines.push(...renderRelatedJobLines(ch.relatedJobs));
      }
      if (ch.rerunCommand && ch.runId && !seenRerunRunIds.has(ch.runId)) {
        seenRerunRunIds.add(ch.runId);
        lines.push(`  rerun: \`${ch.rerunCommand}\``);
      }
      return lines.join("\n");
    });
    sections.push(bullets.join("\n\n"));
  }

  const annotatedChecks = result.triage.checks
    .map((ch) => ({
      ch,
      rendered: (ch.annotations ?? [])
        .map((a) => renderCheckAnnotation(a, ch.logExcerpt))
        .filter((s): s is string => s !== null),
    }))
    .filter(({ rendered }) => rendered.length > 0);
  if (annotatedChecks.length > 0) {
    sections.push("## Check annotations");
    for (const { ch, rendered } of annotatedChecks) {
      const workflowPrefix = ch.workflowName ? `${ch.workflowName} › ` : "";
      const jobLabel = ch.jobName ? ch.jobName : ch.name;
      const locator = ch.runId
        ? `\`${ch.runId}\``
        : ch.detailsUrl
          ? `external \`${ch.detailsUrl}\``
          : "(no runId)";
      sections.push(`### ${locator} — \`${workflowPrefix}${jobLabel}\``);
      sections.push(rendered.join("\n\n"));
    }
  }

  if (result.triage.changesRequestedReviews.length > 0) {
    sections.push("## Changes-requested reviews");
    for (const r of result.triage.changesRequestedReviews) {
      // A stale bot CR that already had its full body surfaced on a prior tick stays a terse
      // one-line reminder (renderReviewBullet's staleBotCr branch) — repeating the full body
      // every tick would be noise, not new content. Every other review (a bot CR's first
      // emission, or any human CR) gets the same H3 + blockquote shape as the sibling
      // review-summary/approval sections below, so the agent actually has a body to read —
      // the bare bullet this replaced only ever rendered the reviewId, never the body.
      if (r.staleBotCr) {
        sections.push(renderReviewBullet(r));
        continue;
      }
      const staleTag = r.staleReview
        ? " [stale — review is on an old commit, all threads resolved; ask reviewer to re-review or dismiss]"
        : "";
      sections.push(
        `### \`reviewId=${r.id}\` (${renderAuthor(r.author, r.authorType, r.authorAssociation)})${staleTag}`,
      );
      sections.push(r.body.trim() === "" ? "(no review body)" : blockquote(r.body, topCap));
    }
  }

  if (result.triage.firstLookSummaries.length > 0) {
    sections.push("## Review summaries (first look)");
    for (const r of result.triage.firstLookSummaries) {
      sections.push(
        `### \`reviewId=${r.id}\` (${renderAuthor(r.author, r.authorType, r.authorAssociation)})${r.viewerCanMinimize === false ? " [viewer cannot minimize]" : ""}`,
      );
      sections.push(r.body.trim() === "" ? "(no review body)" : blockquote(r.body, topCap));
    }
  }

  if (result.triage.editedSummaries.length > 0) {
    sections.push(
      "## Review summaries (edited since first look — already minimized; do not re-minimize)",
    );
    for (const r of result.triage.editedSummaries) {
      sections.push(
        `### \`reviewId=${r.id}\` (${renderAuthor(r.author, r.authorType, r.authorAssociation)})${r.viewerCanMinimize === false ? " [viewer cannot minimize]" : ""}`,
      );
      sections.push(r.body.trim() === "" ? "(no review body)" : blockquote(r.body, topCap));
    }
  }

  const firstLookSummaryIds = new Set(result.triage.firstLookSummaries.map((r) => r.id));
  const seenSummaryIds = result.triage.reviewSummaryIds.filter(
    (id) => !firstLookSummaryIds.has(id),
  );
  if (seenSummaryIds.length > 0) {
    sections.push("## Review IDs to minimize queue");
    sections.push(seenSummaryIds.map((id) => `- \`${id}\``).join("\n"));
  }

  if (result.triage.surfacedApprovals.length > 0) {
    sections.push("## Approvals (surfaced — not minimized)");
    for (const r of result.triage.surfacedApprovals) {
      sections.push(
        `### \`reviewId=${r.id}\` (${renderAuthor(r.author, r.authorType, r.authorAssociation)})${r.viewerCanMinimize === false ? " [viewer cannot minimize]" : ""}`,
      );
      sections.push(r.body.trim() === "" ? "(no review body)" : blockquote(r.body, topCap));
    }
  }

  const firstLookTotal =
    result.triage.firstLookThreads.length + result.triage.firstLookComments.length;
  if (firstLookTotal > 0) {
    sections.push(`## First-look items (${firstLookTotal}) — acknowledge status before acting`);
    const resolutionOnlyIds = new Set(result.triage.resolutionOnlyThreads.map((t) => t.id));
    sections.push(
      buildFirstLookBullets(
        result.triage.firstLookThreads,
        resolutionOnlyIds,
        result.triage.firstLookComments,
        verbose,
      ).join("\n"),
    );
  }

  // The review mutation commands render inline in their `## Instructions` steps.
  const postFixLines = verbose ? [`- base: \`${result.baseBranch}\``] : [];
  if (result.triage.requeue) {
    postFixLines.push(
      `- requeue: ${inlineCode(renderMergeCommand(result.triage.requeue.command))}`,
    );
    if (result.triage.requeue.queueApiFallbackCommand) {
      postFixLines.push(
        `- requeue API fallback: ${inlineCode(renderMergeCommand(result.triage.requeue.queueApiFallbackCommand))}`,
      );
    }
  }
  if (result.triage.queueRemovalAcknowledgment) {
    postFixLines.push(
      `- acknowledge queue removal: ${inlineCode(renderMergeCommand(result.triage.queueRemovalAcknowledgment))}`,
    );
  }
  if (postFixLines.length > 0) sections.push("## Post-fix actions", postFixLines.join("\n"));
  sections.push("## Instructions");
  sections.push(numberInstructions(result.triage.instructions));
  return joinSections(sections);
}
function indentBlockquote(body: string, indent: string): string {
  return blockquote(body)
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
}
