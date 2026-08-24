import type { IterateResult } from "../types.mts";

export function buildSimpleIterateInstructions(
  result: Exclude<IterateResult, { action: "fix_code" }>,
): string[] {
  switch (result.action) {
    case "wait":
      return [
        "No action is needed this tick. Continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.",
      ];
    case "mark_ready":
      return [
        "The CLI marked the PR ready for review. Continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.",
      ];
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
