/**
 * Human-readable text reporter for shepherd check output.
 */

import type { ShepherdReport, TriagedCheck } from "../types.mts";

export function formatText(report: ShepherdReport): string {
  const lines: string[] = [];

  // Header
  lines.push(`\nPR #${report.pr} — ${report.repo}`);
  lines.push(`Status: ${report.status}`);
  lines.push("");

  // Merge status
  const ms = report.mergeStatus;
  lines.push(`Merge Status: ${ms.status}`);
  lines.push(`  mergeStateStatus:       ${ms.mergeStateStatus}`);
  lines.push(`  mergeable:              ${ms.mergeable}`);
  lines.push(`  reviewDecision:         ${ms.reviewDecision ?? "(none)"}`);
  lines.push(`  isDraft:                ${ms.isDraft}`);
  lines.push(`  copilotReviewInProgress:${ms.copilotReviewInProgress}`);
  lines.push("");

  // CI checks
  const { passing, failing, inProgress, skipped } = report.checks;
  const total = passing.length + failing.length + inProgress.length + skipped.length;
  lines.push(`CI Checks: ${passing.length}/${total} passed`);

  if (failing.length > 0) {
    lines.push(`\nFailed Checks (${failing.length}):`);
    for (const c of failing) {
      const triaged = c as TriagedCheck;
      const kind = triaged.failureKind ? ` [${triaged.failureKind}]` : "";
      lines.push(`  - ${c.name}${kind}: ${c.conclusion ?? c.status}`);
      if (triaged.logExcerpt) {
        lines.push(indent(triaged.logExcerpt.split("\n").slice(-10).join("\n"), "    "));
      }
    }
  }

  if (inProgress.length > 0) {
    lines.push(`\nIn Progress (${inProgress.length}):`);
    for (const c of inProgress) {
      lines.push(`  - ${c.name}: ${c.status}`);
    }
  }

  if (skipped.length > 0) {
    lines.push(`\nSkipped (${skipped.length}): ${skipped.map((c) => c.name).join(", ")}`);
  }

  if (report.checks.filtered.length > 0) {
    lines.push(
      `\nFiltered (non-PR-trigger) (${report.checks.filtered.length}): ${report.checks.filtered.map((c) => c.name).join(", ")}`,
    );
    if (report.checks.blockedByFilteredCheck) {
      lines.push(
        "  Note: PR is BLOCKED and all filtered checks are non-PR-trigger — one of these filtered checks may be a required status check blocking merge.",
      );
    } else if (report.mergeStatus.status === "BLOCKED") {
      lines.push(
        "  Note: one or more of these filtered checks may be a required status check blocking merge.",
      );
    }
  }

  lines.push("");

  // Review threads
  const { actionable: actionableThreads, autoResolved, autoResolveErrors } = report.threads;
  if (autoResolved.length > 0) {
    lines.push(`Auto-resolved outdated threads (${autoResolved.length}):`);
    for (const t of autoResolved) {
      lines.push(`  - threadId=${t.id} ${t.path ?? ""}:${t.line ?? "?"} (@${t.author})`);
    }
    lines.push("");
  }

  if (autoResolveErrors.length > 0) {
    lines.push(`Auto-resolve errors (${autoResolveErrors.length}):`);
    for (const e of autoResolveErrors) {
      lines.push(`  - ${e}`);
    }
    lines.push("");
  }

  if (actionableThreads.length > 0) {
    lines.push(`Actionable Review Threads (${actionableThreads.length}):`);
    for (const t of actionableThreads) {
      const label = t.path ? `${t.path}:${t.line ?? "?"}` : "(general)";
      lines.push(`  - threadId=${t.id} ${label} (@${t.author})`);
      lines.push(`    ${firstLine(t.body)}`);
    }
    lines.push("");
  }

  // PR comments
  const { actionable: actionableComments } = report.comments;
  if (actionableComments.length > 0) {
    lines.push(`Actionable PR Comments (${actionableComments.length}):`);
    for (const c of actionableComments) {
      lines.push(`  - commentId=${c.id} (@${c.author}): ${firstLine(c.body)}`);
    }
    lines.push("");
  }

  // CHANGES_REQUESTED reviews
  if (report.changesRequestedReviews.length > 0) {
    lines.push(`Pending CHANGES_REQUESTED reviews (${report.changesRequestedReviews.length}):`);
    for (const r of report.changesRequestedReviews) {
      lines.push(`  - reviewId=${r.id} (@${r.author}): ${firstLine(r.body)}`);
    }
    lines.push("");
  }

  // Summary
  const totalActionable =
    actionableThreads.length + actionableComments.length + report.changesRequestedReviews.length;
  lines.push(
    `Summary: ${totalActionable === 0 ? "0 actionable — all threads resolved/minimized" : `${totalActionable} actionable item(s) remaining`}`,
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstLine(text: string): string {
  return (text.split("\n")[0] ?? "").trim().slice(0, 120);
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((l) => prefix + l)
    .join("\n");
}
