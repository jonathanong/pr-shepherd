import { renderResolveCommand } from "../commands/iterate.mts";
import { safeFence } from "./fence.mts";
import { renderSuggestionBlock, renderLineRange } from "./suggestion-renderer.mts";
import { renderFirstLookItems } from "./first-look.mts";
import type { IterateResultFixCode } from "../types.mts";

export function formatFixCodeResult(header: string, result: IterateResultFixCode): string {
  const sections: string[] = [header];

  if (result.fix.threads.length > 0) {
    sections.push("## Review threads");
    for (const t of result.fix.threads) {
      const lineLabel = renderLineRange(t.startLine, t.line);
      const loc = t.path ? `\`${t.path}:${lineLabel}\`` : "(no location)";
      const heading = t.url ? `[${t.id}](${t.url})` : `\`${t.id}\``;
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
      const heading = c.url ? `[${c.id}](${c.url})` : `\`${c.id}\``;
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
      const lines = [`- ${locator} — \`${workflowPrefix}${jobLabel}\``];
      if (ch.failedStep) lines.push(`  > ${ch.failedStep}`);
      if (ch.summary) lines.push(`  > ${ch.summary}`);
      if (ch.logTail) {
        const fence = safeFence(ch.logTail);
        lines.push(`  ${fence}`);
        lines.push(ch.logTail.replace(/^/gm, "  ").trimEnd());
        lines.push(`  ${fence}`);
      }
      return lines.join("\n");
    });
    sections.push(bullets.join("\n\n"));
  }

  if (result.fix.changesRequestedReviews.length > 0) {
    sections.push("## Changes-requested reviews");
    sections.push(
      result.fix.changesRequestedReviews.map((r) => `- \`${r.id}\` (@${r.author})`).join("\n"),
    );
  }

  if (result.fix.reviewSummaryIds.length > 0) {
    sections.push("## Review summaries (minimize only)");
    sections.push(result.fix.reviewSummaryIds.map((id) => `- \`${id}\``).join("\n"));
  }

  if (result.fix.surfacedApprovals.length > 0) {
    sections.push("## Approvals (surfaced — not minimized)");
    for (const r of result.fix.surfacedApprovals) {
      sections.push(`### \`${r.id}\` (@${r.author})`);
      sections.push(r.body.trim() === "" ? "(no review body)" : blockquote(r.body));
    }
  }

  const firstLook = renderFirstLookItems(result.fix.firstLookThreads, result.fix.firstLookComments);
  if (firstLook) sections.push(firstLook);

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

  return sections.join("\n\n");
}

function blockquote(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");
}
