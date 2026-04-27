import type { IterateResult } from "../types.mts";
import { formatFixCodeResult } from "./fix-formatter.mts";
import { joinSections } from "./markdown.mts";

/**
 * Format an IterateResult as human-readable Markdown.
 *
 * Load-bearing conventions the monitor SKILL relies on:
 *   1. The H1 heading on line 1 contains `[<ACTION>]` — the action tag identifies
 *      the output for logging and validation. Behavior is driven by `## Instructions`,
 *      not by dispatching on the tag.
 *   2. `[FIX_CODE]` uses the `rebase-and-push` variant: the `resolve` bullet under
 *      `## Post-fix push` wraps the resolve command in backticks — the SKILL
 *      extracts the backticked content for execution.
 *   3. Every action ends with a `## Instructions` section — numbered `1.`, `2.`, … —
 *      that tells the monitor exactly what to do with this output. The section is
 *      unconditional: every action, every variant, always emits at least one step.
 *      The SKILL simply follows those steps; it does not need its own dispatch table.
 */
export function formatIterateResult(result: IterateResult, opts?: { verbose?: boolean }): string {
  const verbose = opts?.verbose ?? false;

  const heading = `# PR #${result.pr} [${result.action.toUpperCase()}]`;
  const reviewDecisionSeg =
    result.mergeStatus === "BLOCKED" && result.reviewDecision
      ? ` · **reviewDecision** \`${result.reviewDecision}\``
      : "";
  const baseLine = `**status** \`${result.status}\` · **merge** \`${result.mergeStateStatus}\`${reviewDecisionSeg} · **state** \`${result.state}\` · **repo** \`${result.repo}\``;

  let summaryLine: string;
  if (verbose) {
    summaryLine = `**summary** ${result.summary.passing} passing, ${result.summary.skipped} skipped, ${result.summary.filtered} filtered, ${result.summary.inProgress} inProgress · **remainingSeconds** ${result.remainingSeconds} · **copilotReviewInProgress** ${result.copilotReviewInProgress} · **isDraft** ${result.isDraft} · **shouldCancel** ${result.shouldCancel}`;
  } else {
    const counts = [`${result.summary.passing} passing`];
    if (result.summary.skipped > 0) counts.push(`${result.summary.skipped} skipped`);
    if (result.summary.filtered > 0) counts.push(`${result.summary.filtered} filtered`);
    if (result.summary.inProgress > 0) counts.push(`${result.summary.inProgress} inProgress`);
    const segs = [`**summary** ${counts.join(", ")}`];
    if (result.status === "READY" && result.remainingSeconds > 0) {
      segs.push(`**remainingSeconds** ${result.remainingSeconds}`);
    }
    if (result.copilotReviewInProgress) segs.push(`**copilotReviewInProgress**`);
    if (result.isDraft) segs.push(`**isDraft**`);
    summaryLine = segs.join(" · ");
  }

  const header = [heading, "", baseLine, summaryLine].join("\n");

  switch (result.action) {
    case "cooldown":
      // In default mode: suppress base/summary lines — cooldown carries UNKNOWN/empty
      // placeholders that add no value. Emit only heading + log + Instructions.
      return joinSections([
        verbose ? header : heading,
        result.log,
        "## Instructions\n\n1. End this iteration — the next cron fire will recheck once CI starts reporting.",
      ]);

    case "wait":
      return joinSections([
        header,
        result.log,
        "## Instructions\n\n1. End this iteration — the next cron fire will recheck.",
      ]);

    case "mark_ready":
      return joinSections([
        header,
        result.log,
        "## Instructions\n\n1. The CLI already marked the PR ready for review — end this iteration.",
      ]);

    case "cancel":
      return joinSections([
        [`${heading} — ${result.reason}`, "", baseLine, summaryLine].join("\n"),
        result.log,
        "## Instructions\n\n1. Invoke `/loop cancel` via the Skill tool.\n2. Stop.",
      ]);

    case "escalate":
      return joinSections([
        header,
        result.escalate.humanMessage,
        "## Instructions\n\n1. Invoke `/loop cancel` via the Skill tool.\n2. Stop — the PR needs human direction before monitoring can resume.",
      ]);

    case "fix_code":
      return formatFixCodeResult(header, result);
  }
}
