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
export function buildCheckFollowUpInstructions(
  checks: AgentCheck[],
  repo: string,
  actionsRunIds: ReadonlySet<string>,
): string[] {
  // Only confirmed Actions runs: an external check's details-URL run id is not one.
  const runIds = [
    ...new Set(
      checks.flatMap((check) =>
        check.runId && actionsRunIds.has(check.runId) ? [check.runId] : [],
      ),
    ),
  ];
  const start = runIds.length
    ? ` Start with ${runIds.map((id) => `\`gh run view ${id} -R ${repo}\``).join(", ")}: it lists the run's jobs and annotations.`
    : "";
  return [
    `Shepherd has no rerun to offer and no log excerpt to show for the checks under \`## Failing checks\`, so it cannot tell from GitHub's data why they failed or what would fix them. Find out before acting.${start} ${playbookPointer("Check follow-up")}`,
    "If this PR's changes caused the failure, fix it and push. Otherwise make no change and keep what you found, even if a code change could work around the failure; do not rerun or retrigger these checks, including with an empty or no-op commit. If these checks are unchanged on the next poll, Shepherd escalates with `check-follow-up-unavailable`; report that diagnosis then.",
  ];
}

/**
 * A failing check with evidence (an excerpt, or an external details URL) but no rerun and no
 * further automatic path: an external status, a later attempt, or a merge-group failure once the
 * PR left the queue. The caller can fix a cause in the PR; otherwise it gets one investigation
 * tick before `check-follow-up-unavailable`.
 */
export function isEvidenceFollowUpCheck(check: AgentCheck, queued: boolean): boolean {
  if (check.rerunCommand || checkFollowUp(check) !== undefined) return false;
  // A still-queued merge-group entry waits for GitHub to report its removal.
  if (check.scope === "merge_group" && queued) return false;
  if (check.runId === null) return Boolean(check.detailsUrl?.trim());
  if (!hasLogEvidence(check)) return false;
  return (check.runAttempt ?? 1) > 1 || (check.scope === "merge_group" && !queued);
}

/** The investigation step for evidence-bearing checks: the evidence stays in the failing checks. */
export function buildEvidenceFollowUpInstruction(): string {
  return `Some checks under \`## Failing checks\` have no rerun Shepherd can offer. ${playbookPointer("Check follow-up")}`;
}
