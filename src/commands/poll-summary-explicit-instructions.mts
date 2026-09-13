import { buildQuotaAwareContinuation } from "../quota-warning.mts";
import type { PollSummaryResult } from "../types.mts";

export function explicitInstructions(result: PollSummaryResult): string[] {
  if (result.reason === "all_terminal") return ["1. Stop — every selected PR is terminal."];
  if (result.quotaWarning && result.reason !== "actionable") {
    return [
      buildQuotaAwareContinuation(
        result.quotaWarning,
        "1. This aggregate selection is non-terminal. Before continuing,",
      ),
    ];
  }
  if (result.reason === "waiting" || result.reason === "timeout") {
    return ["1. Run this aggregate selector again when the caller is ready to recheck."];
  }
  const instructions = [
    "1. Choose each non-WAIT, non-CANCEL row that can proceed independently and run or delegate its exact `pollCommand`.",
    "2. Follow each selected one-PR poll's `## Instructions` until it returns `CANCEL` or `ESCALATE`.",
    "3. Run this aggregate poll again after selected work completes; one row's `ESCALATE` does not stop work on other rows.",
  ];
  if (result.quotaWarning) {
    instructions[2] = buildQuotaAwareContinuation(
      result.quotaWarning,
      "3. After selected work completes,",
    );
  }
  return instructions;
}
