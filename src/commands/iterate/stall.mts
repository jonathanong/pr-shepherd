import { readStallState, writeStallState } from "../../state/iterate-stall.mts";
import { toAgentThread, toAgentComment } from "../../reporters/agent.mts";
import { buildEscalateSuggestion, buildEscalateHumanMessage } from "./escalate.mts";
import type {
  EscalateDetails,
  IterateResult,
  IterateResultBase,
  ShepherdReport,
} from "../../types.mts";

export function computeStallFingerprint(
  action: string,
  headSha: string,
  base: IterateResultBase,
  report: ShepherdReport,
  reviewSummaryIds: string[],
): string {
  const checks = [
    ...report.checks.failing.map((f) => `failing:${f.name}:${f.failureKind ?? ""}`),
    ...report.checks.inProgress.map((p) => `inProgress:${p.name}`),
  ].sort();
  const threads = report.threads.actionable.map((t) => t.id).sort();
  const comments = report.comments.actionable.map((c) => c.id).sort();
  const reviews = report.changesRequestedReviews.map((r) => r.id).sort();
  const summaries = [...reviewSummaryIds].sort();
  return JSON.stringify({
    action,
    headSha,
    status: base.status,
    mergeStateStatus: base.mergeStateStatus,
    state: base.state,
    isDraft: base.isDraft,
    checks,
    threads,
    comments,
    reviews,
    summaries,
  });
}

export async function applyStallGuard(
  stallKey: { owner: string; repo: string; pr: number },
  stallTimeoutSeconds: number,
  headSha: string,
  base: IterateResultBase,
  prNumber: number,
  prospectiveResult: IterateResult,
  report: ShepherdReport,
  reviewSummaryIds: string[],
): Promise<IterateResult> {
  const fingerprint = computeStallFingerprint(
    prospectiveResult.action,
    headSha,
    base,
    report,
    reviewSummaryIds,
  );

  const nowSeconds = Math.floor(Date.now() / 1000);
  const stored = await readStallState(stallKey);

  if (stored && stored.fingerprint === fingerprint) {
    const ageSeconds = nowSeconds - stored.firstSeenAt;
    if (ageSeconds < 0 || stallTimeoutSeconds <= 0) {
      // Clock skew or stall detection disabled — refresh firstSeenAt so re-enabling starts fresh.
      await writeStallState(stallKey, { fingerprint, firstSeenAt: nowSeconds });
    } else if (ageSeconds >= stallTimeoutSeconds) {
      const stalledMinutes = Math.floor(ageSeconds / 60);
      const escalateBase: Omit<EscalateDetails, "humanMessage"> = {
        triggers: ["stall-timeout"],
        unresolvedThreads: report.threads.actionable.map(toAgentThread),
        ambiguousComments: report.comments.actionable.map(toAgentComment),
        changesRequestedReviews: report.changesRequestedReviews,
        suggestion: buildEscalateSuggestion(["stall-timeout"], String(stalledMinutes)),
      };
      return {
        ...base,
        action: "escalate",
        escalate: {
          ...escalateBase,
          humanMessage: buildEscalateHumanMessage(escalateBase, prNumber),
        },
      };
    }
    // Within threshold: preserve firstSeenAt, emit the original result.
    return prospectiveResult;
  }

  // Fingerprint changed or no prior state — reset the stall timer.
  await writeStallState(stallKey, { fingerprint, firstSeenAt: nowSeconds });
  return prospectiveResult;
}
