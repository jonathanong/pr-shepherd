import { FIX_INSTRUCTION_STOP } from "../commands/iterate/render.mts";
import type { IterateResult } from "../types.mts";
import { buildPrShepherdCommand } from "./runner.mts";

function buildRecheckInstruction(rerunCommand: string, purpose: string): string {
  return `Recheck: rerun \`${rerunCommand}\` to ${purpose} once after a fresh 30s–4m delay.`;
}

export function buildSimpleIterateInstructions(
  result: Exclude<IterateResult, { action: "fix_code" }>,
  readyDelaySuffix?: string,
): string[] {
  const rerunCommand = buildIterateCommand(result.pr, readyDelaySuffix);
  switch (result.action) {
    case "wait":
      return [buildRecheckInstruction(rerunCommand, "continue the active goal")];
    case "mark_ready":
      return [
        `The CLI already marked the PR ready for review. ${buildRecheckInstruction(rerunCommand, "recheck")}`,
      ];
    case "cancel":
      return ["Stop — the active goal is complete."];
    case "escalate":
      return [
        "Stop — the PR needs human direction before iterating can resume. This is a manual handoff; do not continue automated fix attempts.",
      ];
  }
}

export function adaptFixCodeInstructions(
  instructions: string[],
  pr: number,
  readyDelaySuffix?: string,
): string[] {
  const rerunCommand = buildIterateCommand(pr, readyDelaySuffix);
  return instructions.map((instruction) => {
    if (instruction === FIX_INSTRUCTION_STOP) {
      return `${instruction} ${buildRecheckInstruction(rerunCommand, "recheck")}`;
    }
    return instruction;
  });
}

export function adaptIterateLog(log: string): string {
  return log.replace(/\s+—\s+\d+s until auto-cancel/g, "");
}

export function buildIterateCommand(pr: number, readyDelaySuffix?: string): string {
  const suffix = readyDelaySuffix?.trim();
  return buildPrShepherdCommand([String(pr), ...(suffix ? ["--ready-delay", suffix] : [])]).text;
}

export function numberInstructions(instructions: string[]): string {
  return instructions.map((instruction, i) => `${i + 1}. ${instruction}`).join("\n");
}
