import type { IterateResult } from "../types.mts";

export function buildSimpleIterateInstructions(
  result: Exclude<IterateResult, { action: "fix_code" }>,
): string[] {
  switch (result.action) {
    case "wait":
      return ["No action this tick — the poll loop reruns automatically."];
    case "mark_ready":
      return [
        "The CLI already marked the PR ready for review. No further action this tick — the poll loop reruns automatically.",
      ];
    case "cancel":
      return ["Stop — the active goal is complete."];
    case "escalate":
      return [
        "Stop — the PR needs human direction before iterating can resume. This is a manual handoff; do not continue automated fix attempts.",
      ];
  }
}

export function adaptIterateLog(log: string): string {
  return log.replace(/\s+—\s+\d+s until auto-cancel/g, "");
}

export function numberInstructions(instructions: string[]): string {
  return instructions.map((instruction, i) => `${i + 1}. ${instruction}`).join("\n");
}
