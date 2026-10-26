import { buildQuotaAwareContinuation } from "../quota-warning.mts";
import type { PollSummaryResult } from "../types.mts";
import { isDraftReadinessVerification } from "./stack-work.mts";

/** Every selected row already returned `CANCEL` or `ESCALATE`: no autonomous work remains. */
export function isHandedOffSelection(result: PollSummaryResult): boolean {
  return (
    result.prs.length > 0 &&
    result.prs.every((item) => item.action === "cancel" || item.action === "escalate")
  );
}

/** A final full-review probe can finish this selection without another aggregate read. */
export function onlyDraftVerificationSelection(result: PollSummaryResult): boolean {
  return (
    result.prs.some(isDraftReadinessVerification) &&
    result.prs.every(
      (item) =>
        item.action === "cancel" ||
        item.action === "escalate" ||
        isDraftReadinessVerification(item),
    )
  );
}

/** Rerunning is mandatory while any selected row is non-terminal; a finished one-PR poll is not the end. */
const KEEP_WATCHING =
  "Do not end the turn while any selected row is non-terminal: a one-PR poll returning `CANCEL` or `ESCALATE` finishes only that row, and rows that are `CANCEL`, `ESCALATE`, or handed off do not count.";

export function explicitInstructions(result: PollSummaryResult, rerunCommand?: string): string[] {
  const again = rerunCommand ? `\`${rerunCommand}\`` : "this aggregate command";
  if (result.reason === "all_terminal")
    return [
      result.prs.some((item) => item.reasons.includes("draft-auto-mark-ready-disabled"))
        ? "1. Stop — every selected PR is complete for this Shepherd run."
        : "1. Stop — every selected PR is terminal.",
    ];
  if (result.quotaWarning && result.reason !== "actionable") {
    return [
      buildQuotaAwareContinuation(
        result.quotaWarning,
        `1. This aggregate selection is non-terminal. Run ${again} again at the cadence below. ${KEEP_WATCHING} Before continuing,`,
      ),
    ];
  }
  if (result.reason === "waiting" || result.reason === "timeout") {
    return [`1. Run ${again} again when the caller is ready to recheck. ${KEEP_WATCHING}`];
  }
  const instructions = [
    "1. Choose each non-WAIT, non-CANCEL row that can proceed independently and run or delegate its exact `pollCommand`.",
    "2. Follow each selected one-PR poll's `## Instructions` until it returns `CANCEL` or `ESCALATE`.",
    `3. Run ${again} again after selected work completes; one row's \`ESCALATE\` does not stop work on other rows. ${KEEP_WATCHING}`,
  ];
  if (onlyDraftVerificationSelection(result)) {
    instructions[2] = `3. If every draft verification probe returns \`[CANCEL]\` with reason \`auto-mark-ready-disabled\`, stop this selection and report any \`ESCALATE\` rows; leave the drafts unchanged. If any probe returns \`[ESCALATE]\`, report that handoff and stop after the other probes finish. Otherwise follow the probes' instructions and rerun ${again} when that work completes.`;
  } else if (isHandedOffSelection(result)) {
    instructions[2] =
      "3. Stop after reporting each `ESCALATE` handoff; every selected row is `CANCEL` or `ESCALATE`, so do not run this aggregate poll again.";
  } else if (result.quotaWarning) {
    instructions[2] = buildQuotaAwareContinuation(
      result.quotaWarning,
      `3. After selected work completes, run ${again} again at the cadence below; one row's \`ESCALATE\` does not stop work on other rows. ${KEEP_WATCHING}`,
    );
  }
  return instructions;
}
