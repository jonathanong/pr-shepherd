import type { ShepherdReport, TriagedCheck } from "../types.mts";
import { buildCheckInstructions } from "./check-instructions.mts";
import {
  renderThreadBullet,
  renderCommentBullet,
  renderReviewBullet,
  renderFirstLookStatusTag,
} from "../cli/list-formatters.mts";

export function formatText(report: ShepherdReport): string {
  const parts: string[] = [];

  parts.push(`# PR #${report.pr} [CHECK] — ${report.repo}`);
  parts.push(`Status: ${report.status}`);
  parts.push(`Base: ${report.baseBranch}`);
  parts.push("");

  const ms = report.mergeStatus;
  parts.push("## Merge Status");
  parts.push("");
  parts.push(`- status: \`${ms.status}\``);
  parts.push(`- mergeStateStatus: \`${ms.mergeStateStatus}\``);
  parts.push(`- mergeable: \`${ms.mergeable}\``);
  parts.push(`- reviewDecision: \`${ms.reviewDecision ?? "(none)"}\``);
  parts.push(`- isDraft: \`${ms.isDraft}\``);
  parts.push(`- copilotReviewInProgress: \`${ms.copilotReviewInProgress}\``);
  parts.push("");

  const { passing, failing, inProgress, skipped } = report.checks;
  const total = passing.length + failing.length + inProgress.length + skipped.length;

  parts.push("## CI Checks");
  parts.push("");
  parts.push(`${passing.length}/${total} passed`);
  parts.push("");

  if (failing.length > 0) {
    parts.push(`### Failed (${failing.length})`);
    parts.push("");
    for (const c of failing) {
      const triaged = c as TriagedCheck;
      const prefix = triaged.workflowName ? `${triaged.workflowName} › ` : "";
      parts.push(`- ${prefix}${c.name}: ${c.conclusion ?? c.status}`);
      if (triaged.failedStep) {
        parts.push(`    failed step: ${triaged.failedStep}`);
      }
      if (triaged.summary) {
        parts.push(`    summary: ${triaged.summary}`);
      }
    }
    parts.push("");
  }

  if (inProgress.length > 0) {
    parts.push(`### In Progress (${inProgress.length})`);
    parts.push("");
    for (const c of inProgress) {
      parts.push(`- ${c.name}: ${c.status}`);
    }
    parts.push("");
  }

  if (skipped.length > 0) {
    parts.push(`### Skipped (${skipped.length}): ${skipped.map((c) => c.name).join(", ")}`);
    parts.push("");
  }

  if (report.checks.filtered.length > 0) {
    parts.push(
      `### Filtered non-PR-trigger (${report.checks.filtered.length}): ${report.checks.filtered.map((c) => c.name).join(", ")}`,
    );
    parts.push("");
    if (report.checks.blockedByFilteredCheck) {
      parts.push(
        "> Note: PR is BLOCKED and all filtered checks are non-PR-trigger — one of these filtered checks may be a required status check blocking merge.",
      );
    } else if (report.mergeStatus.status === "BLOCKED") {
      parts.push(
        "> Note: one or more of these filtered checks may be a required status check blocking merge.",
      );
    }
    parts.push("");
  }

  const {
    actionable: actionableThreads,
    autoResolved,
    autoResolveErrors,
    firstLook: firstLookThreads,
  } = report.threads;
  const hasThreadSection =
    autoResolved.length > 0 || autoResolveErrors.length > 0 || actionableThreads.length > 0;

  if (hasThreadSection) {
    parts.push("## Review Threads");
    parts.push("");

    if (autoResolved.length > 0) {
      parts.push(`Auto-resolved outdated (${autoResolved.length}):`);
      for (const t of autoResolved) {
        parts.push(renderThreadBullet(t));
      }
      parts.push("");
    }

    if (autoResolveErrors.length > 0) {
      parts.push(`Auto-resolve errors (${autoResolveErrors.length}):`);
      for (const e of autoResolveErrors) {
        parts.push(`- ${e}`);
      }
      parts.push("");
    }

    if (actionableThreads.length > 0) {
      parts.push(`### Actionable (${actionableThreads.length})`);
      parts.push("");
      for (const t of actionableThreads) {
        parts.push(renderThreadBullet(t));
      }
      parts.push("");
    }
  }

  const { actionable: actionableComments, firstLook: firstLookComments } = report.comments;
  if (actionableComments.length > 0) {
    parts.push("## PR Comments");
    parts.push("");
    parts.push(`### Actionable (${actionableComments.length})`);
    parts.push("");
    for (const c of actionableComments) {
      parts.push(renderCommentBullet(c));
    }
    parts.push("");
  }

  if (report.changesRequestedReviews.length > 0) {
    parts.push("## CHANGES_REQUESTED Reviews");
    parts.push("");
    for (const r of report.changesRequestedReviews) {
      parts.push(renderReviewBullet(r, { includeBody: true }));
    }
    parts.push("");
  }

  if (report.reviewSummaries.length > 0) {
    parts.push("## Review Summaries");
    parts.push("");
    for (const r of report.reviewSummaries) {
      parts.push(renderReviewBullet(r, { includeBody: true }));
    }
    parts.push("");
  }

  if (report.approvedReviews.length > 0) {
    parts.push("## Approved Reviews");
    parts.push("");
    for (const r of report.approvedReviews) {
      parts.push(renderReviewBullet(r, { includeBody: true }));
    }
    parts.push("");
  }
  const firstLookTotal = firstLookThreads.length + firstLookComments.length;
  if (firstLookTotal > 0) {
    parts.push(
      `## First-look items (${firstLookTotal}) — already closed on GitHub; acknowledge only`,
    );
    parts.push("");
    for (const t of firstLookThreads) {
      parts.push(renderThreadBullet(t, { statusTag: renderFirstLookStatusTag(t) }));
    }
    for (const c of firstLookComments) {
      parts.push(renderCommentBullet(c, { statusTag: "[status: minimized]" }));
    }
    parts.push("");
  }

  const totalActionable =
    actionableThreads.length + actionableComments.length + report.changesRequestedReviews.length;
  parts.push("## Summary");
  parts.push("");
  const counts: string[] = [];
  if (totalActionable > 0) counts.push(`${totalActionable} actionable`);
  if (firstLookTotal > 0) counts.push(`${firstLookTotal} first-look`);
  const summaryLine = counts.join(", ") || "0 actionable — all threads resolved/minimized";
  parts.push(summaryLine);
  parts.push("");
  parts.push("## Instructions");
  parts.push("");
  const instructions = buildCheckInstructions(report);
  instructions.forEach((step, i) => {
    parts.push(`${i + 1}. ${step}`);
  });

  return parts.join("\n");
}
