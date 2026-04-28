import type { ShepherdReport, TriagedCheck } from "../types.mts";
import { buildCheckInstructions } from "./check-instructions.mts";
import {
  renderThreadBullet,
  renderCommentBullet,
  renderReviewBullet,
  renderFirstLookStatusTag,
} from "../cli/list-formatters.mts";
import { joinSections } from "../util/markdown.mts";

export function formatText(report: ShepherdReport): string {
  const header = [
    `# PR #${report.pr} [CHECK] — ${report.repo}`,
    `Status: ${report.status}`,
    `Base: ${report.baseBranch}`,
  ].join("\n");

  const ms = report.mergeStatus;
  const mergeStatusSection = [
    "## Merge Status",
    "",
    `- status: \`${ms.status}\``,
    `- mergeStateStatus: \`${ms.mergeStateStatus}\``,
    `- mergeable: \`${ms.mergeable}\``,
    `- reviewDecision: \`${ms.reviewDecision ?? "(none)"}\``,
    `- isDraft: \`${ms.isDraft}\``,
    `- copilotReviewInProgress: \`${ms.copilotReviewInProgress}\``,
  ].join("\n");

  const { passing, failing, inProgress, skipped } = report.checks;
  const total = passing.length + failing.length + inProgress.length + skipped.length;

  const ciSubsections: string[] = [`${passing.length}/${total} passed`];

  if (failing.length > 0) {
    const lines = [`### Failed (${failing.length})`, ""];
    for (const c of failing) {
      const triaged = c as TriagedCheck;
      const prefix = triaged.workflowName ? `${triaged.workflowName} › ` : "";
      lines.push(`- ${prefix}${c.name}: ${c.conclusion ?? c.status}`);
      if (triaged.failedStep) {
        lines.push(`    failed step: ${triaged.failedStep}`);
      }
      if (triaged.summary) {
        lines.push(`    summary: ${triaged.summary}`);
      }
    }
    ciSubsections.push(lines.join("\n"));
  }

  if (inProgress.length > 0) {
    const lines = [`### In Progress (${inProgress.length})`, ""];
    for (const c of inProgress) {
      lines.push(`- ${c.name}: ${c.status}`);
    }
    ciSubsections.push(lines.join("\n"));
  }

  if (skipped.length > 0) {
    ciSubsections.push(`### Skipped (${skipped.length}): ${skipped.map((c) => c.name).join(", ")}`);
  }

  if (report.checks.filtered.length > 0) {
    const lines = [
      `### Filtered non-PR-trigger (${report.checks.filtered.length}): ${report.checks.filtered.map((c) => c.name).join(", ")}`,
      "",
    ];
    if (report.checks.blockedByFilteredCheck) {
      lines.push(
        "> Note: PR is BLOCKED and all filtered checks are non-PR-trigger — one of these filtered checks may be a required status check blocking merge.",
      );
    } else if (report.mergeStatus.status === "BLOCKED") {
      lines.push(
        "> Note: one or more of these filtered checks may be a required status check blocking merge.",
      );
    }
    ciSubsections.push(lines.join("\n"));
  }

  const ciSection = `## CI Checks\n\n${ciSubsections.join("\n\n")}`;

  const {
    actionable: actionableThreads,
    autoResolved,
    autoResolveErrors,
    firstLook: firstLookThreads,
  } = report.threads;
  const hasThreadSection =
    autoResolved.length > 0 || autoResolveErrors.length > 0 || actionableThreads.length > 0;

  let threadsSection: string | null = null;
  if (hasThreadSection) {
    const subparts: string[] = [];

    if (autoResolved.length > 0) {
      const lines = [`Auto-resolved outdated (${autoResolved.length}):`];
      for (const t of autoResolved) {
        lines.push(renderThreadBullet(t));
      }
      subparts.push(lines.join("\n"));
    }

    if (autoResolveErrors.length > 0) {
      const lines = [`Auto-resolve errors (${autoResolveErrors.length}):`];
      for (const e of autoResolveErrors) {
        lines.push(`- ${e}`);
      }
      subparts.push(lines.join("\n"));
    }

    if (actionableThreads.length > 0) {
      const lines = [`### Actionable (${actionableThreads.length})`, ""];
      for (const t of actionableThreads) {
        lines.push(renderThreadBullet(t));
      }
      subparts.push(lines.join("\n"));
    }

    threadsSection = `## Review Threads\n\n${subparts.join("\n\n")}`;
  }

  const { actionable: actionableComments, firstLook: firstLookComments } = report.comments;
  let commentsSection: string | null = null;
  if (actionableComments.length > 0) {
    const lines = [`### Actionable (${actionableComments.length})`, ""];
    for (const c of actionableComments) {
      lines.push(renderCommentBullet(c));
    }
    commentsSection = `## PR Comments\n\n${lines.join("\n")}`;
  }

  const changesRequestedSection = reviewListSection(
    "CHANGES_REQUESTED Reviews",
    report.changesRequestedReviews,
  );
  const allSummaries = [...report.firstLookSummaries, ...report.reviewSummaries];
  const reviewSummariesSection = reviewListSection("Review Summaries", allSummaries);
  const approvedReviewsSection = reviewListSection("Approved Reviews", report.approvedReviews);
  const firstLookTotal = firstLookThreads.length + firstLookComments.length;
  let firstLookSection: string | null = null;
  if (firstLookTotal > 0) {
    const lines = [
      `## First-look items (${firstLookTotal}) — already closed on GitHub; acknowledge only`,
      "",
    ];
    for (const t of firstLookThreads) {
      lines.push(renderThreadBullet(t, { statusTag: renderFirstLookStatusTag(t) }));
    }
    for (const c of firstLookComments) {
      lines.push(renderCommentBullet(c, { statusTag: "[status: minimized]" }));
    }
    firstLookSection = lines.join("\n");
  }

  const totalActionable =
    actionableThreads.length + actionableComments.length + report.changesRequestedReviews.length;
  const counts: string[] = [];
  if (totalActionable > 0) counts.push(`${totalActionable} actionable`);
  if (firstLookTotal > 0) counts.push(`${firstLookTotal} first-look`);
  const summaryLine = counts.join(", ") || "0 actionable — all threads resolved/minimized";
  const summarySection = `## Summary\n\n${summaryLine}`;

  const instructions = buildCheckInstructions(report);
  const instructionsSection = `## Instructions\n\n${instructions.map((step, i) => `${i + 1}. ${step}`).join("\n")}`;

  return joinSections([
    header,
    mergeStatusSection,
    ciSection,
    threadsSection,
    commentsSection,
    changesRequestedSection,
    reviewSummariesSection,
    approvedReviewsSection,
    firstLookSection,
    summarySection,
    instructionsSection,
  ]);
}

function reviewListSection(
  heading: string,
  items: { id: string; author: string; body?: string }[],
): string | null {
  if (items.length === 0) return null;
  return `## ${heading}\n\n${items.map((r) => renderReviewBullet(r, { includeBody: true })).join("\n")}`;
}
