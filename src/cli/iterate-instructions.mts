import type { IterateResult } from "../types.mts";
import { inlineCode } from "../util/markdown.mts";
import { buildQuotaAwareContinuation } from "../quota-warning.mts";
import { renderShellCommand } from "./runner.mts";
import { tickWaitSteps } from "../commands/tick-instructions.mts";

export function buildSimpleIterateInstructions(
  result: Exclude<IterateResult, { action: "triage" }>,
): string[] {
  switch (result.action) {
    case "ready": {
      if (result.nextCheck) {
        return [
          `PR #${result.pr} is ready. Ready-delay has ${result.remainingSeconds}s left. Do not invent unrelated work.`,
          ...tickWaitSteps(result.nextCheck),
        ];
      }
      const sentence = `PR #${result.pr} is ready. Ready-delay has ${result.remainingSeconds}s left. Rerun this command when the timer elapses. Do not invent unrelated work.`;
      return [
        result.quotaWarning ? buildQuotaAwareContinuation(result.quotaWarning, sentence) : sentence,
      ];
    }
    case "wait":
      if (result.nextCheck) {
        return ["Non-terminal — no action needed this tick.", ...tickWaitSteps(result.nextCheck)];
      }
      if (result.quotaWarning) {
        return [
          buildQuotaAwareContinuation(
            result.quotaWarning,
            "Non-terminal — no action needed this tick.",
          ),
        ];
      }
      return [
        "Non-terminal — no action needed this tick. Iterate immediately with the same options to continue.",
      ];
    case "mark_ready":
      if (result.quotaWarning) {
        return [
          buildQuotaAwareContinuation(
            result.quotaWarning,
            "The CLI marked the PR ready for review.",
          ),
        ];
      }
      return [
        "The CLI marked the PR ready for review. Iterate immediately with the same options to continue.",
      ];
    case "merge": {
      // The commands are inline, so no separate `## Merge command` section repeats them.
      const command = inlineCode(renderShellCommand(result.merge.command.argv));
      if (result.merge.mode === "rest" && result.nextCheck)
        return [
          `Run the REST merge command exactly as printed: ${command}. \`enqueued\` is not merged.`,
          ...tickWaitSteps(result.nextCheck),
        ];
      if (result.merge.mode === "rest")
        return [
          `Run the REST merge command exactly as printed: ${command}. If its status is \`pending\`, rerun that same command at the configured polling cadence to resume the recorded request; \`enqueued\` is not merged.`,
          "Then iterate with the same options until GitHub confirms the PR merged or needs work.",
        ];
      const instructions = [
        `Run the ${result.merge.mode === "queue" ? "merge queue" : "auto-merge"} command exactly as printed: ${command}.`,
      ];
      if (result.merge.mode === "queue" && result.merge.queueApiFallbackCommand) {
        instructions.push(
          `If gh says auto-merge is disabled instead of adding the PR to the queue, run the queue API fallback: ${inlineCode(renderShellCommand(result.merge.queueApiFallbackCommand.argv))}.`,
        );
      } else if (result.merge.fallbackCommand) {
        instructions.push(
          `Only if GitHub reports that auto-merge is unavailable, run the plain merge fallback: ${inlineCode(renderShellCommand(result.merge.fallbackCommand.argv))}.`,
        );
      }
      instructions.push(
        result.quotaWarning
          ? buildQuotaAwareContinuation(result.quotaWarning, "After running the merge command.")
          : "Then iterate immediately with the same options until the PR merges or needs work.",
      );
      return instructions;
    }
    case "cancel":
      // `[CANCEL]` needs no steps: stopping, then continuing the original request, is the skill's
      // invariant recurrence rule, and nothing remains to run for this PR.
      return [];
    case "escalate": {
      const pending = result.escalate.pendingReviewCommands;
      if (!pending)
        return ["Stop — human direction is required before automated polling can resume."];
      return [
        "Stop polling. Ask the user whether to run the pending review commands shown above.",
        "If yes, set any `$DISMISS_MESSAGE` to a one-sentence disposition, run every pending command from the pushed PR head, then rerun Shepherd with the same options.",
      ];
    }
  }
}

export function adaptIterateLog(log: string): string {
  return log.replace(/\s+—\s+\d+s until auto-cancel/g, "");
}

export function numberInstructions(instructions: string[]): string {
  return instructions.map((instruction, i) => `${i + 1}. ${instruction}`).join("\n");
}
