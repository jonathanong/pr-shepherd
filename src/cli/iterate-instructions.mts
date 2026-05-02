import type { AgentRuntime } from "../agent-runtime.mts";
import {
  FIX_INSTRUCTION_END_ITERATION,
  FIX_INSTRUCTION_STOP_AFTER_PUSH,
  FIX_INSTRUCTION_STOP_BEFORE_NEXT_TICK,
} from "../commands/iterate/render.mts";
import type { IterateResult } from "../types.mts";

export function buildSimpleIterateInstructions(
  result: Exclude<IterateResult, { action: "fix_code" }>,
  runtime: AgentRuntime,
  readyDelaySuffix?: string,
): string[] {
  const rerunCommand = buildCodexIterateCommand(result.pr, readyDelaySuffix);
  switch (result.action) {
    case "cooldown":
      return [
        runtime === "codex"
          ? `End this iteration — rerun \`${rerunCommand}\` after CI starts reporting.`
          : "End this iteration — the next cron fire will recheck once CI starts reporting.",
      ];
    case "wait":
      return [
        runtime === "codex"
          ? `End this iteration — rerun \`${rerunCommand}\` later to recheck.`
          : "End this iteration — the next cron fire will recheck.",
      ];
    case "mark_ready":
      return [
        runtime === "codex"
          ? `The CLI already marked the PR ready for review — end this iteration. Rerun \`${rerunCommand}\` later to recheck.`
          : "The CLI already marked the PR ready for review — end this iteration.",
      ];
    case "cancel":
      return [
        runtime === "codex"
          ? "Stop — no recurring Codex monitor is running to cancel."
          : "Invoke `/loop cancel` via the Skill tool.",
        "Stop.",
      ];
    case "escalate":
      return [
        runtime === "codex"
          ? "Stop — no recurring Codex monitor is running to cancel."
          : "Invoke `/loop cancel` via the Skill tool.",
        "Stop — the PR needs human direction before monitoring can resume.",
      ];
  }
}

export function adaptFixCodeInstructions(
  instructions: string[],
  pr: number,
  runtime: AgentRuntime,
  readyDelaySuffix?: string,
): string[] {
  if (runtime !== "codex") return instructions;
  const rerunCommand = buildCodexIterateCommand(pr, readyDelaySuffix);
  return instructions.map((instruction) => {
    if (instruction === FIX_INSTRUCTION_STOP_AFTER_PUSH) {
      return `Stop this iteration — CI needs time to run on the new push. Rerun \`${rerunCommand}\` later to recheck.`;
    }
    if (instruction === FIX_INSTRUCTION_STOP_BEFORE_NEXT_TICK) {
      return `Stop this iteration. Rerun \`${rerunCommand}\` later to recheck.`;
    }
    if (instruction === FIX_INSTRUCTION_END_ITERATION) {
      return `Stop this iteration. Rerun \`${rerunCommand}\` later to recheck.`;
    }
    return instruction;
  });
}

export function adaptIterateLog(log: string, runtime: AgentRuntime): string {
  if (runtime !== "codex") return log;
  return log.replace(/\s+—\s+\d+s until auto-cancel/g, "");
}

export function buildCodexIterateCommand(pr: number, readyDelaySuffix?: string): string {
  const suffix = readyDelaySuffix?.trim();
  return `npx pr-shepherd iterate ${pr}${suffix ? ` --ready-delay ${suffix}` : ""}`;
}

export function numberInstructions(instructions: string[]): string {
  return instructions.map((instruction, i) => `${i + 1}. ${instruction}`).join("\n");
}
