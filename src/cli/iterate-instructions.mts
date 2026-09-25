import type { IterateResult, StackDraftHold } from "../types.mts";
import { renderMergeCommand } from "../commands/iterate/merge.mts";
import { inlineCode } from "../util/markdown.mts";
import { buildQuotaAwareContinuation } from "../quota-warning.mts";
import { formatPrUrl } from "../pr-reference.mts";
import { AUTO_MARK_READY_DISABLED_HOLD } from "../commands/stack-work.mts";
import { buildPrShepherdCommand } from "./runner.mts";

export function buildSimpleIterateInstructions(
  result: Exclude<IterateResult, { action: "fix_code" }>,
): string[] {
  switch (result.action) {
    case "wait":
      if (result.stackDraftHold)
        return [buildStackDraftHoldInstruction(result, result.stackDraftHold)];
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
      const instructions = [
        `Run the \`${result.merge.mode === "queue" ? "merge queue" : "auto-merge"}\` command shown above exactly as printed.`,
      ];
      if (result.merge.mode === "queue" && result.merge.queueApiFallbackCommand) {
        instructions.push(
          `If the gh CLI says auto-merge is disabled instead of adding the PR to the queue, run the \`queue API fallback\` command: ${inlineCode(renderMergeCommand(result.merge.queueApiFallbackCommand))}.`,
        );
      } else if (result.merge.fallbackCommand) {
        instructions.push(
          `Only if GitHub reports that auto-merge is unavailable, run the \`plain merge fallback\` command: ${inlineCode(renderMergeCommand(result.merge.fallbackCommand))}.`,
        );
      }
      instructions.push(
        result.quotaWarning
          ? buildQuotaAwareContinuation(result.quotaWarning, "After running the merge command.")
          : "Then iterate immediately with the same options to monitor until the PR merges or needs work.",
      );
      return instructions;
    }
    case "cancel":
      return ["Stop — the PR loop is complete. No further polling is needed."];
    case "escalate": {
      const pending = result.escalate.pendingReviewCommands;
      if (!pending)
        return ["Stop — human direction is required before automated polling can resume."];
      return [
        "Stop polling. Ask the user whether to run the pending review commands shown above.",
        "If yes, replace any `$HEAD_SHA` with the full 40-character pushed PR-head SHA and any `$DISMISS_MESSAGE` with a one-sentence disposition, run every pending command, then rerun Shepherd with the same options.",
      ];
    }
  }
}

/**
 * A held stack draft cannot advance by repeating its one-PR session, so hand control back
 * to the stack selector instead of asking for another immediate iteration.
 */
function buildStackDraftHoldInstruction(
  result: Extract<IterateResult, { action: "wait" }>,
  hold: StackDraftHold,
): string {
  const stackCommand = buildPrShepherdCommand([
    "--stack",
    formatPrUrl(result.repo, result.pr),
    "--until-terminal",
  ]).text;
  const handoff = `a \`--stack\` selector listed this session, finish that selector's remaining steps and rerun it with its original flags; otherwise run ${inlineCode(stackCommand)}, adding \`--merge\` when merging was requested.`;
  const reason =
    hold.kind === "auto-mark-ready-disabled" ? AUTO_MARK_READY_DISABLED_HOLD : hold.kind;
  const instruction = `PR #${result.pr} stays in draft because ${reason}, so repeating this one-PR session cannot advance it. If ${handoff}`;
  return result.quotaWarning
    ? buildQuotaAwareContinuation(result.quotaWarning, instruction)
    : instruction;
}

export function adaptIterateLog(log: string): string {
  return log.replace(/\s+—\s+\d+s until auto-cancel/g, "");
}

export function numberInstructions(instructions: string[]): string {
  return instructions.map((instruction, i) => `${i + 1}. ${instruction}`).join("\n");
}
