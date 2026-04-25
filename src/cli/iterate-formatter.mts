import type { IterateResult } from "../types.mts";
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
export function formatIterateResult(result: IterateResult, opts?: { verbose?: boolean }): string {
  const verbose = opts?.verbose ?? false;

  const heading = `# PR #${result.pr} [${result.action.toUpperCase()}]`;
  const baseLine = `**status** \`${result.status}\` · **merge** \`${result.mergeStateStatus}\` · **state** \`${result.state}\` · **repo** \`${result.repo}\``;

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
      return [
        verbose ? header : heading,
        "",
        result.log,
        "",
        "## Instructions",
        "",
        "1. End this iteration — the next cron fire will recheck once CI starts reporting.",
      ].join("\n");

    case "wait": {
      const parts = [
        header,
        result.log,
        "## Instructions",
        "1. End this iteration — the next cron fire will recheck.",
      ];
      return parts.join("\n\n").replace(/\n\n\n+/g, "\n\n");
    }

    case "rerun_ci": {
      const rerunInstructions = result.reran.map(
        (r, i) => `${i + 1}. Run: \`gh run rerun ${r.runId} --failed\``,
      );
      rerunInstructions.push(
        `${rerunInstructions.length + 1}. End this iteration — wait for CI to report results after the re-run.`,
      );
      const parts = [header, result.log, "## Instructions", rerunInstructions.join("\n")];
      return parts.join("\n\n").replace(/\n\n\n+/g, "\n\n");
    }

    case "mark_ready": {
      const parts = [
        header,
        result.log,
        "## Instructions",
        "1. The CLI already marked the PR ready for review — end this iteration.",
      ];
      return parts.join("\n\n").replace(/\n\n\n+/g, "\n\n");
    }

    case "cancel": {
      const parts = [
        [`${heading} — ${result.reason}`, "", baseLine, summaryLine].join("\n"),
        result.log,
        "## Instructions",
        "1. Invoke `/loop cancel` via the Skill tool.\n2. Stop.",
      ];
      return parts.join("\n\n").replace(/\n\n\n+/g, "\n\n");
    }

    case "escalate": {
      const parts = [
        header,
        result.escalate.humanMessage,
        "## Instructions",
        "1. Invoke `/loop cancel` via the Skill tool.\n2. Stop — the PR needs human direction before monitoring can resume.",
      ];
      return parts.join("\n\n").replace(/\n\n\n+/g, "\n\n");
    }

    case "fix_code":
      return formatFixCodeResult(header, result);
  }
}

/**
 * Project an IterateResult to a lean JSON shape for the default (non-verbose) output.
 * Omits fields that are the trivial default (false, 0, empty) or state-gated fields
 * outside the state where they are meaningful.
 */
export function projectIterateLean(result: IterateResult): unknown {
  const base: Record<string, unknown> = {
    action: result.action,
    pr: result.pr,
    repo: result.repo || undefined,
    status: result.status,
    state: result.state,
    mergeStateStatus: result.mergeStateStatus,
    ...(result.copilotReviewInProgress && { copilotReviewInProgress: true }),
    ...(result.isDraft && { isDraft: true }),
    summary: {
      passing: result.summary.passing,
      ...(result.summary.skipped > 0 && { skipped: result.summary.skipped }),
      ...(result.summary.filtered > 0 && { filtered: result.summary.filtered }),
      ...(result.summary.inProgress > 0 && { inProgress: result.summary.inProgress }),
    },
    // remainingSeconds: only when the ready-delay timer is actively counting down
    ...(result.status === "READY" &&
      result.remainingSeconds > 0 && {
        remainingSeconds: result.remainingSeconds,
      }),
    ...(result.baseBranch && { baseBranch: result.baseBranch }),
  };

  switch (result.action) {
    case "cooldown":
      return { ...base, log: result.log };
    case "wait":
      return { ...base, log: result.log };
    case "cancel":
      return { ...base, reason: result.reason, log: result.log };
    case "rerun_ci":
      return {
        ...base,
        ...(result.checks.length > 0 && { checks: result.checks }),
        reran: result.reran,
        log: result.log,
      };
    case "mark_ready":
      // drop markedReady — always true, redundant with action discriminator
      return { ...base, log: result.log };
    case "fix_code":
      return {
        ...base,
        ...(result.checks.length > 0 && { checks: result.checks }),
        ...(result.cancelled.length > 0 && { cancelled: result.cancelled }),
        fix: {
          mode: result.fix.mode,
          threads: result.fix.threads,
          ...(result.fix.actionableComments.length > 0 && {
            actionableComments: result.fix.actionableComments,
          }),
          ...(result.fix.noiseCommentIds.length > 0 && {
            noiseCommentIds: result.fix.noiseCommentIds,
          }),
          ...(result.fix.reviewSummaryIds.length > 0 && {
            reviewSummaryIds: result.fix.reviewSummaryIds,
          }),
          ...(result.fix.surfacedSummaries.length > 0 && {
            surfacedSummaries: result.fix.surfacedSummaries,
          }),
          checks: result.fix.checks,
          ...(result.fix.changesRequestedReviews.length > 0 && {
            changesRequestedReviews: result.fix.changesRequestedReviews,
          }),
          resolveCommand: result.fix.resolveCommand,
          instructions: result.fix.instructions,
        },
      };
    case "escalate":
      return {
        ...base,
        escalate: {
          triggers: result.escalate.triggers,
          ...(result.escalate.unresolvedThreads.length > 0 && {
            unresolvedThreads: result.escalate.unresolvedThreads,
          }),
          ...(result.escalate.ambiguousComments.length > 0 && {
            ambiguousComments: result.escalate.ambiguousComments,
          }),
          ...(result.escalate.changesRequestedReviews.length > 0 && {
            changesRequestedReviews: result.escalate.changesRequestedReviews,
          }),
          ...(result.escalate.attemptHistory &&
            result.escalate.attemptHistory.length > 0 && {
              attemptHistory: result.escalate.attemptHistory,
            }),
          suggestion: result.escalate.suggestion,
          humanMessage: result.escalate.humanMessage,
        },
      };
  }
}
