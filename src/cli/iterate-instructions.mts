import type { AgentRuntime } from "../agent-runtime.mts";
import {
  FIX_INSTRUCTION_END_ITERATION,
  FIX_INSTRUCTION_STOP_AFTER_PUSH,
  FIX_INSTRUCTION_STOP_BEFORE_NEXT_TICK,
} from "../commands/iterate/render.mts";
import type { IterateResult } from "../types.mts";
import { buildPrShepherdCommand, type CliRunner } from "./runner.mts";

const CLAUDE_DYNAMIC_WAKEUP =
  "Schedule the next dynamic wakeup with `ScheduleWakeup` using `delaySeconds` between 60 and 240 and the same loop prompt (skip if running under a fixed-interval cron loop — the next scheduled fire handles it), then end this iteration.";
const CODEX_DYNAMIC_WAIT = "pick a fresh sleep/timeout between 1 and 4 minutes, wait that long";

function capitalizeFirst(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function buildSimpleIterateInstructions(
  result: Exclude<IterateResult, { action: "fix_code" }>,
  runtime: AgentRuntime,
  readyDelaySuffix?: string,
  runner?: CliRunner,
): string[] {
  const rerunCommand = buildCodexIterateCommand(result.pr, readyDelaySuffix, runner);
  const retryDelay = buildCodexRetryDelay();
  switch (result.action) {
    case "cooldown":
      return [
        runtime === "codex"
          ? `Continue the active Codex goal — ${retryDelay}, then rerun \`${rerunCommand}\` after CI starts reporting.`
          : `CI still needs time to start reporting. ${CLAUDE_DYNAMIC_WAKEUP}`,
      ];
    case "wait":
      return [
        runtime === "codex"
          ? `Continue the active Codex goal — ${retryDelay}, then rerun \`${rerunCommand}\` to recheck.`
          : CLAUDE_DYNAMIC_WAKEUP,
      ];
    case "mark_ready":
      return [
        runtime === "codex"
          ? `The CLI already marked the PR ready for review. Continue the active Codex goal until the ready-delay completes — ${retryDelay}, then rerun \`${rerunCommand}\` to recheck.`
          : `The CLI already marked the PR ready for review. ${CLAUDE_DYNAMIC_WAKEUP}`,
      ];
    case "cancel":
      return [
        runtime === "codex"
          ? "Stop — no recurring Codex monitor is running to cancel."
          : `Stop — do not schedule another dynamic wakeup. If this loop was started with a fixed-interval \`/loop\` schedule, call \`CronList\`, find the job whose prompt contains \`#pr-shepherd-loop:pr=${result.pr}:\`, and cancel it with \`CronDelete\`.`,
        "Stop.",
      ];
    case "escalate":
      return [
        runtime === "codex"
          ? "Stop — no recurring Codex monitor is running to cancel."
          : `Stop — do not schedule another dynamic wakeup. If this loop was started with a fixed-interval \`/loop\` schedule, call \`CronList\`, find the job whose prompt contains \`#pr-shepherd-loop:pr=${result.pr}:\`, and cancel it with \`CronDelete\`.`,
        "Stop — the PR needs human direction before monitoring can resume.",
      ];
  }
}

export function adaptFixCodeInstructions(
  instructions: string[],
  pr: number,
  runtime: AgentRuntime,
  readyDelaySuffix?: string,
  runner?: CliRunner,
): string[] {
  if (runtime !== "codex") return instructions;
  const rerunCommand = buildCodexIterateCommand(pr, readyDelaySuffix, runner);
  const retryDelay = buildCodexRetryDelay();
  return instructions.map((instruction) => {
    if (instruction === FIX_INSTRUCTION_STOP_AFTER_PUSH) {
      return `Continue the active Codex goal — CI needs time to run on the new push. ${capitalizeFirst(retryDelay)}, then rerun \`${rerunCommand}\` to recheck.`;
    }
    if (
      instruction === FIX_INSTRUCTION_STOP_BEFORE_NEXT_TICK ||
      instruction === FIX_INSTRUCTION_END_ITERATION
    ) {
      return `Continue the active Codex goal — ${retryDelay}, then rerun \`${rerunCommand}\` to recheck.`;
    }
    return instruction;
  });
}

export function adaptIterateLog(log: string, runtime: AgentRuntime): string {
  if (runtime !== "codex") return log;
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

export function buildCodexRetryDelay(): string {
  return CODEX_DYNAMIC_WAIT;
}

export function numberInstructions(instructions: string[]): string {
  return instructions.map((instruction, i) => `${i + 1}. ${instruction}`).join("\n");
}
