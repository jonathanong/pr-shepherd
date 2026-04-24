import type { IterateResult, RelevantCheck } from "../types.mts";
import { formatFixCodeResult } from "./fix-formatter.mts";

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
export function formatIterateResult(result: IterateResult): string {
  const heading = `# PR #${result.pr} [${result.action.toUpperCase()}]`;
  const baseLine = `**status** \`${result.status}\` · **merge** \`${result.mergeStateStatus}\` · **state** \`${result.state}\` · **repo** \`${result.repo}\``;
  const summaryLine = `**summary** ${result.summary.passing} passing, ${result.summary.skipped} skipped, ${result.summary.filtered} filtered, ${result.summary.inProgress} inProgress · **remainingSeconds** ${result.remainingSeconds} · **copilotReviewInProgress** ${result.copilotReviewInProgress} · **isDraft** ${result.isDraft} · **shouldCancel** ${result.shouldCancel}`;
  const header = [heading, "", baseLine, summaryLine].join("\n");
  const checksSection = formatChecksSection(result.checks);

  switch (result.action) {
    case "cooldown":
      return [
        header,
        "",
        result.log,
        "",
        "## Instructions",
        "",
        "1. End this iteration — the next cron fire will recheck once CI starts reporting.",
      ].join("\n");

    case "wait": {
      const parts = [header];
      if (checksSection) parts.push(checksSection);
      parts.push(
        result.log,
        "## Instructions",
        "1. End this iteration — the next cron fire will recheck.",
      );
      return parts.join("\n\n").replace(/\n\n\n+/g, "\n\n");
    }

    case "rerun_ci": {
      const rerunInstructions = result.reran.map(
        (r, i) => `${i + 1}. Run: \`gh run rerun ${r.runId} --failed\``,
      );
      rerunInstructions.push(
        `${rerunInstructions.length + 1}. End this iteration — wait for CI to report results after the re-run.`,
      );
      const parts = [header];
      if (checksSection) parts.push(checksSection);
      parts.push(result.log, "## Instructions", rerunInstructions.join("\n"));
      return parts.join("\n\n").replace(/\n\n\n+/g, "\n\n");
    }

    case "mark_ready": {
      const parts = [header];
      if (checksSection) parts.push(checksSection);
      parts.push(
        result.log,
        "## Instructions",
        "1. The CLI already marked the PR ready for review — end this iteration.",
      );
      return parts.join("\n\n").replace(/\n\n\n+/g, "\n\n");
    }

    case "cancel": {
      const parts = [header];
      if (checksSection) parts.push(checksSection);
      parts.push(
        result.log,
        "## Instructions",
        "1. Invoke `/loop cancel` via the Skill tool.\n2. Stop.",
      );
      return parts.join("\n\n").replace(/\n\n\n+/g, "\n\n");
    }

    case "escalate": {
      const parts = [header];
      if (checksSection) parts.push(checksSection);
      parts.push(
        result.escalate.humanMessage,
        "## Instructions",
        "1. Invoke `/loop cancel` via the Skill tool.\n2. Stop — the PR needs human direction before monitoring can resume.",
      );
      return parts.join("\n\n").replace(/\n\n\n+/g, "\n\n");
    }

    case "fix_code":
      return formatFixCodeResult(header, checksSection, result);
  }
}

export function formatChecksSection(checks: RelevantCheck[]): string | null {
  const failing = checks.filter((c) => c.conclusion !== "SUCCESS");
  if (failing.length === 0) return null;
  const bullets = failing.map((c) => {
    const locator = c.runId
      ? `\`${c.runId}\``
      : c.detailsUrl
        ? `external \`${c.detailsUrl}\``
        : "(no runId)";
    const prefix = c.workflowName ? `${c.workflowName} › ` : "";
    const entry = [`- ✗ \`${prefix}${c.name}\` — ${c.conclusion} · ${locator}`];
    if (c.failedStep) entry.push(`  > ${c.failedStep}`);
    if (c.summary) entry.push(`  > ${c.summary}`);
    return entry.join("\n");
  });
  return ["## Checks", "", bullets.join("\n\n")].join("\n");
}
