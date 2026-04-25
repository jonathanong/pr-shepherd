import { renderResolveCommand } from "../commands/iterate.mts";
import type { IterateResultFixCode } from "../types.mts";

export function formatFixCodeResult(header: string, result: IterateResultFixCode): string {
  const sections: string[] = [header];

  if (result.fix.threads.length > 0) {
    sections.push("## Review threads");
    for (const t of result.fix.threads) {
      const loc = t.path ? `\`${t.path}:${t.line ?? "?"}\`` : "(no location)";
      const heading = t.url ? `[${t.id}](${t.url})` : `\`${t.id}\``;
      sections.push(`### ${heading} — ${loc} (@${t.author})`);
      sections.push(blockquote(t.body));
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
      const prefix = ch.workflowName ? `${ch.workflowName} › ` : "";
      const locator = ch.runId
        ? `\`${ch.runId}\``
        : ch.detailsUrl
          ? `external \`${ch.detailsUrl}\``
          : "(no runId)";
      const lines = [`- ${locator} — \`${prefix}${ch.name}\``];
      if (ch.failedStep) lines.push(`  > ${ch.failedStep}`);
      if (ch.summary) lines.push(`  > ${ch.summary}`);
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

  if (result.fix.noiseCommentIds.length > 0) {
    sections.push("## Noise (minimize only)");
    sections.push(result.fix.noiseCommentIds.map((id) => `\`${id}\``).join(", "));
  }

  if (result.fix.reviewSummaryIds.length > 0) {
    sections.push("## Review summaries (minimize only)");
    sections.push(result.fix.reviewSummaryIds.map((id) => `\`${id}\``).join(", "));
  }

  if (result.fix.surfacedApprovals.length > 0) {
    sections.push("## Approvals (surfaced — not minimized)");
    for (const r of result.fix.surfacedApprovals) {
      sections.push(`### \`${r.id}\` (@${r.author})`);
      sections.push(blockquote(r.body));
    }
  }

  if (result.cancelled.length > 0) {
    sections.push("## Cancelled runs");
    sections.push(result.cancelled.map((id) => `\`${id}\``).join(", "));
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

export function blockquote(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");
}
