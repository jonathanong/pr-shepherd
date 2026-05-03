import type { AgentRuntime } from "../agent-runtime.mts";
import {
  FIX_INSTRUCTION_END_ITERATION,
  FIX_INSTRUCTION_STOP_AFTER_PUSH,
  FIX_INSTRUCTION_STOP_BEFORE_NEXT_TICK,
} from "../commands/iterate/render.mts";
import type { IterateResult } from "../types.mts";

const CODEX_DYNAMIC_RETRY_DELAY = "a fresh sleep/timeout between 1 and 4 minutes";

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
          ? `Continue the active Codex goal — pick ${CODEX_DYNAMIC_RETRY_DELAY}, wait that long, then rerun \`${rerunCommand}\` after CI starts reporting.`
          : "End this iteration — the next cron fire will recheck once CI starts reporting.",
      ];
    case "wait":
      return [
        runtime === "codex"
          ? `Continue the active Codex goal — pick ${CODEX_DYNAMIC_RETRY_DELAY}, wait that long, then rerun \`${rerunCommand}\` to recheck.`
          : "End this iteration — the next cron fire will recheck.",
      ];
    case "mark_ready":
      return [
        runtime === "codex"
          ? `The CLI already marked the PR ready for review. Continue the active Codex goal until the ready-delay completes — pick ${CODEX_DYNAMIC_RETRY_DELAY}, wait that long, then rerun \`${rerunCommand}\` to recheck.`
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
      return `Continue the active Codex goal — CI needs time to run on the new push. Pick ${CODEX_DYNAMIC_RETRY_DELAY}, wait that long, then rerun \`${rerunCommand}\` to recheck.`;
    }
    if (
      instruction === FIX_INSTRUCTION_STOP_BEFORE_NEXT_TICK ||
      instruction === FIX_INSTRUCTION_END_ITERATION
    ) {
      return `Continue the active Codex goal — pick ${CODEX_DYNAMIC_RETRY_DELAY}, wait that long, then rerun \`${rerunCommand}\` to recheck.`;
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
  return `npx pr-shepherd ${pr}${suffix ? ` --ready-delay ${suffix}` : ""}`;
}

export function numberInstructions(instructions: string[]): string {
  return instructions.map((instruction, i) => `${i + 1}. ${instruction}`).join("\n");
}
