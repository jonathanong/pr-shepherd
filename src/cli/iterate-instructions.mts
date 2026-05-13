import type { AgentRuntime } from "../agent-runtime.mts";
import {
  FIX_INSTRUCTION_STOP_AFTER_PUSH,
  FIX_INSTRUCTION_STOP_BEFORE_NEXT_TICK,
} from "../commands/iterate/render.mts";
import type { IterateResult } from "../types.mts";
import { buildPrShepherdCommand, type CliRunner } from "./runner.mts";

function buildRecheckInstruction(
  runtime: AgentRuntime,
  rerunCommand: string,
  purpose: string,
): string {
  if (runtime === "codex") {
    return `Pick a fresh sleep/timeout between 30 seconds and 4 minutes, wait that long, then rerun \`${rerunCommand}\` to ${purpose}.`;
  }
  return `Schedule one session-only follow-up task to run \`${rerunCommand}\` to ${purpose} once after a fresh delay between 30 seconds and 4 minutes, then end this turn. Do not sleep or rerun inline.`;
}

export function buildSimpleIterateInstructions(
  result: Exclude<IterateResult, { action: "fix_code" }>,
  runtime: AgentRuntime,
  readyDelaySuffix?: string,
  runner?: CliRunner,
): string[] {
  const rerunCommand = buildIterateCommand(result.pr, readyDelaySuffix, runner);
  switch (result.action) {
    case "wait":
      return [buildRecheckInstruction(runtime, rerunCommand, "continue the active goal")];
    case "mark_ready":
      return [
        `The CLI already marked the PR ready for review. ${buildRecheckInstruction(runtime, rerunCommand, "recheck")}`,
      ];
    case "cancel":
      return ["Stop — the active goal is complete."];
    case "escalate":
      return ["Stop — the PR needs human direction before iterating can resume."];
  }
}

export function adaptFixCodeInstructions(
  instructions: string[],
  pr: number,
  runtime: AgentRuntime,
  readyDelaySuffix?: string,
  runner?: CliRunner,
): string[] {
  const rerunCommand = buildIterateCommand(pr, readyDelaySuffix, runner);
  return instructions.map((instruction) => {
    if (instruction === FIX_INSTRUCTION_STOP_AFTER_PUSH) {
      return `CI needs time to run on the new push. ${buildRecheckInstruction(runtime, rerunCommand, "recheck")}`;
    }
    if (instruction === FIX_INSTRUCTION_STOP_BEFORE_NEXT_TICK) {
      return buildRecheckInstruction(runtime, rerunCommand, "recheck");
    }
    return instruction;
  });
}

export function adaptIterateLog(log: string, _runtime: AgentRuntime): string {
  return log.replace(/\s+—\s+\d+s until auto-cancel/g, "");
}

export function buildIterateCommand(
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
