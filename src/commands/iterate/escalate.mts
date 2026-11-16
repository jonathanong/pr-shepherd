/* eslint-disable max-lines */
import { renderReviewCommitTag } from "../../cli/list-formatters.mts";
import { renderRelatedJobLines } from "../../cli/related-jobs-format.mts";
import { renderPendingDeploymentLines } from "../../cli/pending-deployments-format.mts";
import { renderStalledCheckLines } from "../../cli/stalled-check-format.mts";
import type { AgentCheck, EscalateDetails, EscalateTrigger, ReviewThread } from "../../types.mts";
import { loadConfig } from "../../config/load.mts";
import { renderResolveCommand } from "./render.mts";

interface EscalateCheck {
  triggers: EscalateTrigger[];
  thrashHistory?: EscalateDetails["thrashHistory"];
}

function renderEscalateAuthor(item: {
  author: string;
  authorType?: string;
  authorAssociation?: string;
}): string {
  return [`@${item.author}`, item.authorType, item.authorAssociation].filter(Boolean).join(" · ");
}

function renderCheckTarget(check: AgentCheck): string {
  const parts: string[] = [];
  if (check.runId) parts.push(`run \`${check.runId}\``);
  if (check.detailsUrl) parts.push(`URL \`${check.detailsUrl}\``);
  return parts.length > 0 ? parts.join(", ") : "no run ID or URL";
}

function renderCheckScope(check: AgentCheck): string {
  if (!check.scope) return "";
  const commit = check.commitOid ? ` at \`${check.commitOid}\`` : "";
  return `, scope \`${check.scope}\`${commit}`;
}

function renderBlockquoteLines(value: string, indent: string): string[] {
  return value.split("\n").map((line) => `${indent}> ${line}`);
}

type AgentCheckAnnotation = NonNullable<AgentCheck["annotations"]>[number];

function renderEscalateAnnotation(annotation: AgentCheckAnnotation): string[] {
  const start = annotation.startLine ?? annotation.endLine ?? "?";
  const end = annotation.endLine ?? annotation.startLine ?? "?";
  const range = start === end ? String(start) : `${start}-${end}`;
  const columns =
    annotation.startColumn == null && annotation.endColumn == null
      ? ""
      : `, columns ${annotation.startColumn ?? "?"}-${annotation.endColumn ?? "?"}`;
  const title = annotation.title ? ` — ${annotation.title}` : "";
  const link = annotation.blobUrl ? ` [source](${annotation.blobUrl})` : "";
  const lines = [
    `  - annotation \`${annotation.id}\`${link} — \`${annotation.path}:${range}\` [${annotation.level}${columns}]${title}`,
    ...renderBlockquoteLines(annotation.message, "    "),
  ];
  if (annotation.rawDetails) {
    lines.push(...renderBlockquoteLines(annotation.rawDetails, "    "));
  }
  return lines;
}

function renderEscalateCheck(check: AgentCheck): string[] {
  const workflowPrefix = check.workflowName ? `${check.workflowName} › ` : "";
  const jobLabel = check.jobName ?? check.name;
  const conclusionTag =
    check.status !== undefined
      ? `[status: ${check.status}, suite: ${check.suiteStatus}]`
      : `[conclusion: ${check.conclusion ?? "UNKNOWN"}]`;
  const attempt = check.runAttempt !== undefined ? ` [attempt: ${check.runAttempt}]` : "";
  const lines = [
    `- ${renderCheckTarget(check)} — \`${workflowPrefix}${jobLabel}\` ${conclusionTag}${attempt}${renderCheckScope(check)}`,
  ];
  if (check.failedStep) lines.push(`  > failed step: ${check.failedStep}`);
  if (check.summary) lines.push(`  > ${check.summary}`);
  if (check.logExcerpt) lines.push(...renderBlockquoteLines(check.logExcerpt, "  "));
  lines.push(...renderRelatedJobLines(check.relatedJobs));
  lines.push(...renderPendingDeploymentLines(check.pendingDeployments));
  if (check.rerunCommand) lines.push(`  rerun: \`${check.rerunCommand}\``);
  for (const annotation of check.annotations ?? []) {
    lines.push(...renderEscalateAnnotation(annotation));
  }
  return lines;
}

export function checkEscalateTriggers(
  actionableThreads: ReviewThread[],
  threadAttempts: Record<string, number>,
): EscalateCheck {
  const triggers: EscalateTrigger[] = [];
  const maxAttempts = loadConfig().iterate["triage-attempts-per-thread"];

  // Trigger 1: triage thrash — same thread dispatched too many times without resolving.
  const thrashThreads = actionableThreads.filter((t) => (threadAttempts[t.id] ?? 0) >= maxAttempts);
  if (thrashThreads.length > 0) {
    triggers.push("triage-thrash");
  }

  return {
    triggers,
    thrashHistory:
      thrashThreads.length > 0
        ? thrashThreads.map((t) => ({ threadId: t.id, attempts: threadAttempts[t.id] ?? 0 }))
        : undefined,
  };
}

export { formatDurationApprox } from "./duration-approx.mts";

interface BaseBranchLookup {
  /** The validated name, or a placeholder when `unusable` is set. */
  branch: string;
  /** True when the name is empty or outside `[A-Za-z0-9._/-]`. A name outside that set is never
   * interpolated into a printed command; the caller reads the base from the PR instead. */
  unusable: boolean;
}

/** Stands in for a base branch name that failed validation, in prose only. */
const UNKNOWN_BASE_BRANCH = "<base branch>";

/**
 * Validate the base branch name from the GraphQL batch (`report.baseBranch`). The branch is
 * interpolated into printed shell commands, so a name outside `[A-Za-z0-9._/-]` (or an empty
 * one) is `unusable`: callers omit the command and tell the agent to read the base from the PR.
 */
export function validateBaseBranch(raw: string): BaseBranchLookup {
  const trimmed = raw.trim();
  return /^[A-Za-z0-9._/-]+$/.test(trimmed)
    ? { branch: trimmed, unusable: false }
    : { branch: UNKNOWN_BASE_BRANCH, unusable: true };
}

export function buildEscalateHumanMessage(
  escalate: Omit<EscalateDetails, "humanMessage">,
  pr: string | number,
  opts?: { merge?: boolean },
): string {
  const lines: string[] = [];
  lines.push("⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required");
  lines.push("");
  lines.push(`**Triggers:** ${escalate.triggers.map((t) => `\`${t}\``).join(", ")}`);
  lines.push("");
  lines.push(escalate.suggestion);

  const hasItems =
    escalate.unresolvedThreads.length > 0 ||
    escalate.changesRequestedReviews.length > 0 ||
    escalate.ambiguousComments.length > 0 ||
    (escalate.firstLookSummaries?.length ?? 0) > 0 ||
    (escalate.editedSummaries?.length ?? 0) > 0 ||
    (escalate.checks?.length ?? 0) > 0 ||
    (escalate.stalledChecks?.length ?? 0) > 0;
  if (hasItems) {
    lines.push("");
    lines.push("## Items needing attention");
    lines.push("");
    for (const c of escalate.stalledChecks ?? []) lines.push(...renderStalledCheckLines(c));
    if ((escalate.stalledChecks?.length ?? 0) > 0) lines.push("");
    for (const check of escalate.checks ?? []) {
      lines.push(...renderEscalateCheck(check), "");
    }
    for (const t of escalate.unresolvedThreads) {
      const loc = t.path ? `\`${t.path}:${t.line ?? "?"}\`` : "(no location)";
      lines.push(`- thread \`${t.id}\` — ${loc} (${renderEscalateAuthor(t)}):`);
      lines.push("");
      if (!t.comments?.length) {
        for (const bodyLine of t.body.split("\n")) lines.push(`  > ${bodyLine}`);
        lines.push("");
        continue;
      }
      // The transcript starts with the root comment, whose body is the thread body.
      for (const c of t.comments) {
        lines.push(`  - comment \`${c.id}\` (${renderEscalateAuthor(c)}):`, "");
        for (const bodyLine of c.body.split("\n")) lines.push(`    > ${bodyLine}`);
        lines.push("");
      }
    }
    for (const r of escalate.changesRequestedReviews) {
      lines.push(`- review \`${r.id}\` (${renderEscalateAuthor(r)})${renderReviewCommitTag(r)}:`);
      lines.push("");
      for (const bodyLine of r.body.split("\n")) lines.push(`  > ${bodyLine}`);
      lines.push("");
    }
    for (const [heading, summaries] of [
      ["Review summaries (first look)", escalate.firstLookSummaries ?? []],
      ["Review summaries (edited since first look)", escalate.editedSummaries ?? []],
    ] as const) {
      if (summaries.length === 0) continue;
      lines.push(`### ${heading}`, "");
      for (const summary of summaries) {
        lines.push(`- review \`${summary.id}\` (${renderEscalateAuthor(summary)}):`, "");
        for (const bodyLine of summary.body.split("\n")) lines.push(`  > ${bodyLine}`);
        lines.push("");
      }
    }
    for (const c of escalate.ambiguousComments) {
      lines.push(`- comment \`${c.id}\` (${renderEscalateAuthor(c)}):`);
      lines.push("");
      for (const bodyLine of c.body.split("\n")) lines.push(`  > ${bodyLine}`);
      lines.push("");
    }
  }

  if (escalate.mergeQueueRemoval) {
    const removal = escalate.mergeQueueRemoval;
    lines.push("");
    lines.push("## Merge queue removal");
    lines.push("");
    lines.push(`- reason: \`${removal.reason ?? "not provided"}\``);
    if (removal.actor) lines.push(`- actor: \`@${removal.actor}\``);
    lines.push(`- createdAtUnix: \`${removal.createdAtUnix}\``);
    if (removal.beforeCommitOid) lines.push(`- queue commit: \`${removal.beforeCommitOid}\``);
  }

  if (escalate.authorization && escalate.authorization.length > 0) {
    lines.push("");
    lines.push("## Authorization");
    lines.push("");
    for (const item of escalate.authorization) {
      lines.push(
        `- ${item.action}: ${item.targetIds.map((id) => `\`${id}\``).join(", ")} — GitHub denied the action or did not expose a confirming capability`,
      );
    }
  }

  if (escalate.thrashHistory && escalate.thrashHistory.length > 0) {
    lines.push("");
    lines.push("## Fix attempts");
    lines.push("");
    for (const a of escalate.thrashHistory) {
      lines.push(`- thread \`${a.threadId}\` pending commands returned ${a.attempts} times`);
    }
  }

  const pending = escalate.pendingReviewCommands;
  if (pending?.resolveOnlyCommand?.hasMutations || pending?.resolveCommand?.hasMutations) {
    lines.push("", "## Pending review commands", "");
    if (pending.resolveOnlyCommand?.hasMutations) {
      lines.push(`- resolve-only: \`${renderResolveCommand(pending.resolveOnlyCommand)}\``);
    }
    if (pending.resolveCommand?.hasMutations) {
      lines.push(`- apply review: \`${renderResolveCommand(pending.resolveCommand)}\``);
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    `After completing manual fixes (and pushing if required), rerun \`/pr-shepherd:pr-shepherd ${pr}${opts?.merge ? " --merge" : ""}\` to resume.`,
  );
  return lines.join("\n");
}

export function buildEscalateSuggestion(triggers: EscalateTrigger[], detail?: string): string {
  if (triggers.includes("check-follow-up-unavailable")) {
    if (detail === "investigated") {
      return "The failing checks below have no rerun Shepherd can offer. After one investigation tick they are unchanged on this head. Report what the investigation found. What remains is a repository, CI-configuration, or workflow-permission change, or waiting out a GitHub incident; each is a human decision.";
    }
    return "One or more failing checks have no autonomous follow-up available. Use the displayed conclusion, run or URL, and included evidence to handle them manually.";
  }
  if (triggers.includes("authorization-required")) {
    return "GitHub did not confirm that the current viewer may perform the automatic mark-ready operation. Ask a repository maintainer to mark the pull request ready before resuming Shepherd.";
  }
  if (triggers.includes("merge-queue-removed")) {
    const reason = detail ? ` GitHub reason: ${detail}.` : "";
    return `The PR left the merge queue without an actionable check failure, and the removal was unchanged after one investigation tick.${reason} Report what the investigation found. Confirm the removal was not intentional before adding it again.`;
  }
  if (triggers.includes("stall-timeout")) {
    const duration = detail ?? "60 minutes";
    return `No progress detected for ${duration} — state has not changed. This is a manual checkpoint: inspect the PR and apply a manual fix before resuming.`;
  }
  if (triggers.includes("required-checks-unreported")) {
    const names = detail ? ` (${detail})` : "";
    return `Required checks are still unreported${names}: no CI ran on this head after the investigation tick and one retrigger, and no CI is running. Report what the investigation found. What remains is a repository, CI-configuration, or branch-policy change, or waiting out a GitHub incident; each is a human decision.`;
  }
  if (triggers.includes("stall-state-unavailable")) {
    const reason = detail ?? "unknown error";
    return `The stall timer could not be saved (${reason}). Fix PR_SHEPHERD_STATE_DIR or the directory permissions, then resume. Automated polling is paused because a stuck loop would not be detected.`;
  }
  if (triggers.includes("triage-thrash")) {
    const attempts = loadConfig().iterate["triage-attempts-per-thread"];
    return `The same thread(s) remain unresolved after their pending review commands were returned for ${attempts} TRIAGE ticks. Automated iteration is paused for a manual decision.`;
  }
  return "Ambiguous state — automated handling cannot proceed safely. Inspect the PR and act manually.";
}
