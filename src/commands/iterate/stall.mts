import { readStallState, writeStallState } from "../../state/iterate-stall.mts";
import { toAgentThread, toAgentComment, toAgentStalledCheck } from "../../reporters/agent.mts";
import { buildEscalateSuggestion, buildEscalateHumanMessage } from "./escalate.mts";
import type {
  ClassifiedCheck,
  EscalateDetails,
  IterateResult,
  IterateResultBase,
  ShepherdReport,
} from "../../types.mts";

function computeStallFingerprint(
  action: string,
  headSha: string,
  base: IterateResultBase,
  report: ShepherdReport,
  reviewSummaryIds: string[],
): string {
  const checks = [
    ...report.checks.failing.map((f) => `failing:${f.name}:${f.conclusion}`),
    ...report.checks.inProgress.map((p) => `inProgress:${p.name}`),
  ].sort();
  const threads = report.threads.actionable.map((t) => t.id).sort();
  const resolutionOnlyThreads = report.threads.resolutionOnly.map((t) => t.id).sort();
  const ruleAutoResolveThreads = (report.threads.ruleAutoResolveIds ?? []).sort();
  const comments = report.comments.actionable.map((c) => c.id).sort();
  const reviews = report.changesRequestedReviews.map((r) => r.id).sort();
  const summaries = [...reviewSummaryIds].sort();
  const ruleAutoResolveSummaries = (report.ruleAutoResolveReviewSummaryIds ?? []).sort();
  return JSON.stringify({
    action,
    headSha,
    status: base.status,
    mergeStateStatus: base.mergeStateStatus,
    state: base.state,
    isDraft: base.isDraft,
    checks,
    threads,
    resolutionOnlyThreads,
    ruleAutoResolveThreads,
    comments,
    reviews,
    summaries,
    ruleAutoResolveSummaries,
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
  const nowSeconds = Math.floor(Date.now() / 1000);
  const stalledChecks = findCiStartStalledChecks(report.checks.inProgress, nowSeconds, {
    stallTimeoutSeconds,
    action: prospectiveResult.action,
  });
  if (stalledChecks.length > 0) {
    const stalledMinutes = Math.floor(Math.max(...stalledChecks.map((c) => c.ageSeconds)) / 60);
    const escalateBase: Omit<EscalateDetails, "humanMessage"> = {
      triggers: ["stall-timeout"],
      unresolvedThreads: [],
      ambiguousComments: [],
      changesRequestedReviews: [],
      stalledChecks,
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

  const fingerprint = computeStallFingerprint(
    prospectiveResult.action,
    headSha,
    base,
    report,
    reviewSummaryIds,
  );

  const stored = await readStallState(stallKey);

  if (stored && stored.fingerprint === fingerprint) {
    const ageSeconds = nowSeconds - stored.firstSeenAt;
    if (ageSeconds < 0) {
      // Clock skew: stored timestamp is in the future. Reset to avoid perpetually negative age.
      await writeStallState(stallKey, { fingerprint, firstSeenAt: nowSeconds });
    } else if (stallTimeoutSeconds <= 0) {
      // Stall detection disabled: refresh so re-enabling starts a fresh timer.
      await writeStallState(stallKey, { fingerprint, firstSeenAt: nowSeconds });
    } else if (ageSeconds >= stallTimeoutSeconds) {
      const stalledMinutes = Math.floor(ageSeconds / 60);
      const escalateBase: Omit<EscalateDetails, "humanMessage"> = {
        triggers: ["stall-timeout"],
        unresolvedThreads: [...report.threads.actionable, ...report.threads.resolutionOnly].map(
          toAgentThread,
        ),
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

function findCiStartStalledChecks(
  checks: ClassifiedCheck[],
  nowSeconds: number,
  opts: { stallTimeoutSeconds: number; action: IterateResult["action"] },
) {
  if (opts.stallTimeoutSeconds <= 0 || opts.action !== "wait") return [];
  return checks
    .filter((c) => isUnstartedCheck(c))
    .map((c) => toAgentStalledCheck(c, nowSeconds))
    .filter((c) => c.createdAtUnix !== undefined && c.ageSeconds >= opts.stallTimeoutSeconds);
}

function isUnstartedCheck(check: ClassifiedCheck): boolean {
  if (check.source === "status_context") return true;
  if (check.startedAtUnix !== undefined) return false;
  return (
    check.status === "PENDING" ||
    check.status === "QUEUED" ||
    check.status === "REQUESTED" ||
    check.status === "WAITING"
  );
}
