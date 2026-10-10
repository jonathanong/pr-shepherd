import type { IterateResult, StackDraftHold } from "../types.mts";
import { inlineCode } from "../util/markdown.mts";
import { buildQuotaAwareContinuation } from "../quota-warning.mts";
import { formatPrUrl } from "../pr-reference.mts";
import { AUTO_MARK_READY_DISABLED_HOLD } from "../commands/stack-work.mts";
import { buildPrShepherdCommand } from "./runner.mts";
import { eventWaitSteps } from "../commands/event-instructions.mts";
import { playbookPointer } from "../commands/playbook-pointer.mts";

export function buildSimpleIterateInstructions(
  result: Exclude<IterateResult, { action: "fix_code" }>,
): string[] {
  switch (result.action) {
    case "ready": {
      if (result.nextCheck) {
        return [
          `PR #${result.pr} is ready. Ready-delay has ${result.remainingSeconds}s left. Do not invent unrelated work.`,
          ...eventWaitSteps(result.nextCheck),
        ];
      }
      const sentence = `PR #${result.pr} is ready. Ready-delay has ${result.remainingSeconds}s left. Rerun this command when the timer elapses. Do not invent unrelated work.`;
      return [
        result.quotaWarning ? buildQuotaAwareContinuation(result.quotaWarning, sentence) : sentence,
      ];
    }
    case "wait":
      if (result.stackDraftHold)
        return buildStackDraftHoldInstructions(result, result.stackDraftHold);
      if (result.nextCheck) {
        return ["Non-terminal — no action needed this tick.", ...eventWaitSteps(result.nextCheck)];
      }
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
      // Event mode reruns at once too: Shepherd is not polling, so no cadence applies.
      if (result.quotaWarning && result.pollMode !== "event") {
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
      if (result.merge.mode === "rest" && result.nextCheck)
        return [
          "Run the `REST merge` command shown above exactly as printed; `enqueued` is not merged.",
          ...eventWaitSteps(result.nextCheck),
        ];
      if (result.merge.mode === "rest")
        return [
          "Run the `REST merge` command shown above exactly as printed. If its status is `pending`, rerun that same command at the configured polling cadence to resume the recorded request; `enqueued` is not merged.",
          "Then iterate with the same options until GitHub confirms the PR merged or needs work.",
        ];
      const instructions = [
        `Run the \`${result.merge.mode === "queue" ? "merge queue" : "auto-merge"}\` command shown above exactly as printed.`,
      ];
      if (result.merge.mode === "queue" && result.merge.queueApiFallbackCommand) {
        instructions.push(
          `If the gh CLI says auto-merge is disabled instead of adding the PR to the queue, run the \`queue API fallback\` command shown above.`,
        );
      } else if (result.merge.fallbackCommand) {
        instructions.push(
          `Only if GitHub reports that auto-merge is unavailable, run the \`plain merge fallback\` command shown above.`,
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
      // `[CANCEL]` needs no steps: stopping, then continuing the original request, is the skill's
      // invariant recurrence rule, and nothing remains to run for this PR.
      return [];
    case "escalate": {
      const pending = result.escalate.pendingReviewCommands;
      if (!pending)
        return ["Stop — human direction is required before automated polling can resume."];
      return [
        "Stop polling. Ask the user whether to run the pending review commands shown above.",
        "If yes, set any `$DISMISS_MESSAGE` to a one-sentence disposition, run every pending command from the pushed PR head, then rerun Shepherd with the same options.",
      ];
    }
  }
}

/**
 * A held stack draft cannot advance by repeating its one-PR session, so hand control back
 * to the stack selector instead of asking for another immediate iteration.
 */
function buildStackDraftHoldInstructions(
  result: Extract<IterateResult, { action: "wait" }>,
  hold: StackDraftHold,
): string[] {
  const event = result.pollMode === "event";
  const stackCommand = buildPrShepherdCommand([
    "--stack",
    formatPrUrl(result.repo, result.pr),
    "--until-terminal",
    ...(event ? ["--poll-mode", "event"] : []),
  ]).text;
  const handoff = `a \`--stack\` selector listed this session, finish that selector's remaining steps and rerun it with its original flags; otherwise run ${inlineCode(stackCommand)}, adding \`--merge\` when merging was requested.`;
  const reason =
    hold.kind === "auto-mark-ready-disabled" ? AUTO_MARK_READY_DISABLED_HOLD : hold.kind;
  const instruction = `PR #${result.pr} stays in draft because ${reason}, so repeating this one-PR session cannot advance it. If ${handoff}`;
  const step = result.quotaWarning
    ? buildQuotaAwareContinuation(result.quotaWarning, instruction)
    : instruction;
  if (!event) return [step];
  return [
    step,
    `Event mode: do not rerun this one-PR session and keep no wake-up for it. After the handoff, follow only the stack selector's output; it ends the turn and schedules the next tick through its own \`nextCheck\`. ${playbookPointer("Cloud event loop")}`,
  ];
}

export function adaptIterateLog(log: string): string {
  return log.replace(/\s+—\s+\d+s until auto-cancel/g, "");
}

export function numberInstructions(instructions: string[]): string {
  return instructions.map((instruction, i) => `${i + 1}. ${instruction}`).join("\n");
}
