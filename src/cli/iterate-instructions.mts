import type { IterateResult } from "../types.mts";
import { renderMergeCommand } from "../commands/iterate/merge.mts";

export function buildSimpleIterateInstructions(
  result: Exclude<IterateResult, { action: "fix_code" }>,
): string[] {
  switch (result.action) {
    case "wait":
      return [
        "Non-terminal — no action needed this tick. Iterate again with the same options to continue.",
      ];
    case "mark_ready":
      return [
        "The CLI marked the PR ready for review. Iterate again with the same options to continue.",
      ];
    case "merge": {
      const instructions = [
        `Run the \`${result.merge.mode === "queue" ? "merge queue" : "auto-merge"}\` command shown above exactly as printed.`,
      ];
      if (result.merge.mode === "queue" && result.merge.queueApiFallbackCommand) {
        instructions.push(
          `If the gh CLI says auto-merge is disabled instead of adding the PR to the queue, run the \`queue API fallback\` command: \`${renderMergeCommand(result.merge.queueApiFallbackCommand)}\`.`,
        );
      } else if (result.merge.fallbackCommand) {
        instructions.push(
          `Only if GitHub reports that auto-merge is unavailable, run the \`plain merge fallback\` command: \`${renderMergeCommand(result.merge.fallbackCommand)}\`.`,
        );
      }
      instructions.push(
        "Then iterate again with the same options to monitor until the PR merges or needs work.",
      );
      return instructions;
    }
    case "cancel":
      return ["Stop — the PR loop is complete. No further polling is needed."];
    case "escalate":
      return ["Stop — human direction is required before automated polling can resume."];
  }
}

export function adaptIterateLog(log: string): string {
  return log.replace(/\s+—\s+\d+s until auto-cancel/g, "");
}

export function numberInstructions(instructions: string[]): string {
  return instructions.map((instruction, i) => `${i + 1}. ${instruction}`).join("\n");
}
