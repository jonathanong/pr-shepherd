import type { AgentRuntime } from "../agent-runtime.mts";
import {
  FIX_INSTRUCTION_END_ITERATION,
  FIX_INSTRUCTION_STOP_AFTER_PUSH,
  FIX_INSTRUCTION_STOP_BEFORE_NEXT_TICK,
} from "../commands/iterate/render.mts";
import type { IterateResult } from "../types.mts";
import { buildPrShepherdCommand, type CliRunner } from "./runner.mts";

export function buildSimpleIterateInstructions(
  result: Exclude<IterateResult, { action: "fix_code" }>,
  _runtime: AgentRuntime,
  readyDelaySuffix?: string,
  runner?: CliRunner,
): string[] {
  const rerunCommand = buildCodexIterateCommand(result.pr, readyDelaySuffix, runner);
  switch (result.action) {
    case "wait":
      return [
        `Pick a fresh sleep/timeout between 30 seconds and 4 minutes, wait that long, then rerun \`${rerunCommand}\` to continue the active goal.`,
      ];
    case "mark_ready":
      return [
        `The CLI already marked the PR ready for review. Pick a fresh sleep/timeout between 30 seconds and 4 minutes, wait that long, then rerun \`${rerunCommand}\` to recheck.`,
      ];
    case "cancel":
      return ["Stop — the active goal is complete."];
    case "escalate":
      return ["Stop — the PR needs human direction before monitoring can resume."];
  }
}

export function adaptFixCodeInstructions(
  instructions: string[],
  pr: number,
  _runtime: AgentRuntime,
  readyDelaySuffix?: string,
  runner?: CliRunner,
): string[] {
  const rerunCommand = buildCodexIterateCommand(pr, readyDelaySuffix, runner);
  return instructions.map((instruction) => {
    if (instruction === FIX_INSTRUCTION_STOP_AFTER_PUSH) {
      return `CI needs time to run on the new push. Pick a fresh sleep/timeout between 30 seconds and 4 minutes, wait that long, then rerun \`${rerunCommand}\` to recheck.`;
    }
    if (
      instruction === FIX_INSTRUCTION_STOP_BEFORE_NEXT_TICK ||
      instruction === FIX_INSTRUCTION_END_ITERATION
    ) {
      return `Pick a fresh sleep/timeout between 30 seconds and 4 minutes, wait that long, then rerun \`${rerunCommand}\` to recheck.`;
    }
    return instruction;
  });
}

export function adaptIterateLog(log: string, _runtime: AgentRuntime): string {
  return log.replace(/\s+—\s+\d+s until auto-cancel/g, "");
}

export function buildCodexIterateCommand(
  pr: number,
  readyDelaySuffix?: string,
  runner?: CliRunner,
): string {
  const suffix = readyDelaySuffix?.trim();
  return buildPrShepherdCommand([String(pr), ...(suffix ? ["--ready-delay", suffix] : [])], {
    runner,
  }).text;
}

export function numberInstructions(instructions: string[]): string {
  return instructions.map((instruction, i) => `${i + 1}. ${instruction}`).join("\n");
}
