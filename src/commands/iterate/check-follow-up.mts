import type { AgentCheck } from "../../types.mts";
import { playbookPointer } from "../playbook-pointer.mts";
import { hasLogEvidence } from "./check-evidence.mts";

/**
 * What a failing check with no authorized rerun needs next.
 * `approval`: a gate only a human can grant. `investigate`: the agent can find out why.
 */
export type CheckFollowUp = "approval" | "investigate";

export function checkFollowUp(check: AgentCheck): CheckFollowUp | undefined {
  if (check.rerunCommand) return undefined;
  if (check.conclusion === "ACTION_REQUIRED") return "approval";
  if (check.conclusion === "CANCELLED" || check.conclusion === "STARTUP_FAILURE") {
    return "investigate";
  }
  // A later attempt cannot be rerun automatically, but its included log can still identify a
  // fix. Without evidence the agent can fetch the log itself.
  if (check.runAttempt !== undefined && check.runAttempt > 1) {
    return hasLogEvidence(check) ? undefined : "investigate";
  }
  // An external check's direct URL is actionable evidence: the agent can inspect the provider.
  if (check.runId === null) return check.detailsUrl?.trim() ? undefined : "investigate";
  return hasLogEvidence(check) ? undefined : "investigate";
}

/** The one investigation tick: raw facts, the playbook, and the bounded outcome. */
export function buildCheckFollowUpInstructions(): string[] {
  return [
    `Shepherd has no rerun to offer and no log excerpt to show for the checks under \`## Failing checks\`, so it cannot tell from GitHub's data why they failed or what would fix them. Find out before acting. ${playbookPointer("Check follow-up")}`,
    "If the cause is within this PR, fix it and push. If a rerun is the right call, run it once. Otherwise make no change and keep what you found. If these checks are unchanged on the next poll, Shepherd escalates with `check-follow-up-unavailable`; report that diagnosis then.",
  ];
}
