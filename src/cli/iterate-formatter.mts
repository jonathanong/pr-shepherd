import type { IterateResult } from "../types.mts";
import { formatFixCodeResult } from "./fix-formatter.mts";
import { joinSections } from "../util/markdown.mts";
import {
  adaptIterateLog,
  buildSimpleIterateInstructions,
  numberInstructions,
} from "./iterate-instructions.mts";

function formatActivityLine(result: IterateResult): string | null {
  const activity = result.activity ?? {
    commitCount: 0,
    reviewRoundCount: 0,
    latestCommitCommittedAtUnix: null,
    reviewItemsSinceLatestCommit: [],
  };
  const hasActiveChecks = (result.inProgressChecks?.length ?? 0) > 0;
  if (
    activity.commitCount === 0 &&
    activity.reviewRoundCount === 0 &&
    activity.reviewItemsSinceLatestCommit.length === 0 &&
    !hasActiveChecks
  ) {
    return null;
  }
  const parts = [`${activity.commitCount} commits`, `${activity.reviewRoundCount} review rounds`];
  if (activity.reviewItemsSinceLatestCommit.length > 0) {
    parts.push(`${activity.reviewItemsSinceLatestCommit.length} review items since latest commit`);
  }
  if (hasActiveChecks) {
    parts.push(
      `active: ${result
        .inProgressChecks!.slice(0, 5)
        .map((c) => `\`${c.name}\``)
        .join(", ")}`,
    );
  }
  return `**activity** ${parts.join(" · ")}`;
}

/**
 * Format an IterateResult as human-readable Markdown.
 *
 * Load-bearing conventions the iterate skill relies on:
 *   1. The H1 heading on line 1 contains `[<ACTION>]` — the action tag identifies
 *      the output for logging and validation. Behavior is driven by `## Instructions`,
 *      not by dispatching on the tag.
 *   2. `[FIX_CODE]` wraps the `resolve` command under `## Post-fix push` in
 *      backticks — the skill extracts the backticked content for execution.
 *   3. Every action ends with a `## Instructions` section — numbered `1.`, `2.`, … —
 *      that tells the agent exactly what to do with this output. The section is
 *      unconditional: every action, every variant, always emits at least one step.
 *      The skill simply follows those steps; it does not need its own dispatch table.
 */
export function formatIterateResult(
  result: IterateResult,
  opts?: {
    verbose?: boolean;
    readyDelaySuffix?: string;
  },
): string {
  const verbose = opts?.verbose ?? false;
  const readyDelaySuffix = opts?.readyDelaySuffix;

  const heading = `# PR #${result.pr} [${result.action.toUpperCase()}]`;
  const reviewDecisionSeg =
    result.mergeStatus === "BLOCKED" && result.reviewDecision
      ? ` · **reviewDecision** \`${result.reviewDecision}\``
      : "";
  const baseLine = `**status** \`${result.status}\` · **merge** \`${result.mergeStateStatus}\`${reviewDecisionSeg} · **state** \`${result.state}\` · **repo** \`${result.repo}\``;

  let summaryLine: string;
  if (verbose) {
    let verboseBranch = "";
    if (result.mergeStatus === "BEHIND" && result.baseBranch) {
      verboseBranch = ` · **branch** behind \`origin/${result.baseBranch}\``;
    } else if (result.mergeStatus === "CONFLICTS" && result.baseBranch) {
      verboseBranch = ` · **branch** conflicts with \`origin/${result.baseBranch}\``;
    }
    summaryLine = `**summary** ${result.summary.passing} passing, ${result.summary.skipped} skipped, ${result.summary.filtered} filtered, ${result.summary.inProgress} inProgress · **remainingSeconds** ${result.remainingSeconds} · **blockingBotReviewInProgress** ${result.blockingBotReviewInProgress} · **isDraft** ${result.isDraft} · **shouldCancel** ${result.shouldCancel}${verboseBranch}`;
  } else {
    const counts = [`${result.summary.passing} passing`];
    if (result.summary.skipped > 0) counts.push(`${result.summary.skipped} skipped`);
    if (result.summary.filtered > 0) counts.push(`${result.summary.filtered} filtered`);
    if (result.summary.inProgress > 0) counts.push(`${result.summary.inProgress} inProgress`);
    const segs = [`**summary** ${counts.join(", ")}`];
    if (result.status === "READY" && result.remainingSeconds > 0) {
      segs.push(`**remainingSeconds** ${result.remainingSeconds}`);
    }
    if (result.blockingBotReviewInProgress) segs.push(`**blockingBotReviewInProgress**`);
    if (result.isDraft) segs.push(`**isDraft**`);
    if (result.mergeStatus === "BEHIND" && result.baseBranch) {
      segs.push(`**branch** behind \`origin/${result.baseBranch}\``);
    } else if (result.mergeStatus === "CONFLICTS" && result.baseBranch) {
      segs.push(`**branch** conflicts with \`origin/${result.baseBranch}\``);
    }
    summaryLine = segs.join(" · ");
  }

  // Surface an explicit `--ready-delay` override (set only when the user passed the flag)
  // so the active settle window stays visible on every tick. Replaces the rerun command
  // that previously carried the suffix in the (now removed) recheck instruction.
  if (readyDelaySuffix) {
    summaryLine += ` · **ready-delay** \`${readyDelaySuffix}\` (override)`;
  }

  const bp = result.branchProtection;
  const requiredParts: string[] = [];
  if (bp) {
    if (bp.requiresApprovingReviews && bp.requiredApprovingReviewCount > 0) {
      requiredParts.push(`approvals \`${bp.requiredApprovingReviewCount}\``);
    }
    if (bp.requiresConversationResolution) {
      requiredParts.push("conversation-resolution required");
    }
    if (bp.requiresStatusChecks) {
      if (bp.requiredStatusCheckContexts.length > 0) {
        requiredParts.push(
          `checks: ${bp.requiredStatusCheckContexts.map((c) => `\`${c}\``).join(", ")}`,
        );
      } else {
        requiredParts.push("status checks required");
      }
    }
  }
  const requiredLine = requiredParts.length > 0 ? `**required** ${requiredParts.join(", ")}` : null;

  const headerLines = [heading, "", baseLine, summaryLine];
  if (requiredLine) headerLines.push(requiredLine);
  if (result.ignoredNames && result.ignoredNames.length > 0) {
    headerLines.push(`**ignored** ${result.ignoredNames.map((n) => `\`${n}\``).join(", ")}`);
  }
  const activityLine = formatActivityLine(result);
  if (activityLine) headerLines.push(activityLine);
  const header = headerLines.join("\n");

  switch (result.action) {
    case "wait":
      return joinSections([
        header,
        adaptIterateLog(result.log),
        `## Instructions\n\n${numberInstructions(buildSimpleIterateInstructions(result))}`,
      ]);

    case "mark_ready":
      return joinSections([
        header,
        adaptIterateLog(result.log),
        `## Instructions\n\n${numberInstructions(buildSimpleIterateInstructions(result))}`,
      ]);

    case "cancel": {
      const cancelHeaderLines = [`${heading} — ${result.reason}`, "", baseLine, summaryLine];
      if (requiredLine) cancelHeaderLines.push(requiredLine);
      if (activityLine) cancelHeaderLines.push(activityLine);
      return joinSections([
        cancelHeaderLines.join("\n"),
        adaptIterateLog(result.log),
        `## Instructions\n\n${numberInstructions(buildSimpleIterateInstructions(result))}`,
      ]);
    }

    case "escalate":
      return joinSections([
        header,
        result.escalate.humanMessage,
        `## Instructions\n\n${numberInstructions(buildSimpleIterateInstructions(result))}`,
      ]);

    case "fix_code":
      return formatFixCodeResult(header, result);
  }
}
