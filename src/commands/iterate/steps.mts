import { applyStallGuard } from "./stall.mts";
import {
  validateBaseBranch,
  buildRebaseShellScript,
  buildEscalateSuggestion,
  buildEscalateHumanMessage,
} from "./escalate.mts";
import type {
  EscalateDetails,
  IterateResult,
  IterateResultBase,
  ShepherdReport,
  TriagedCheck,
} from "../../types.mts";

export async function buildRerunCiResult(
  transientChecks: TriagedCheck[],
  base: IterateResultBase,
  prNumber: number,
  stallKey: { owner: string; repo: string; pr: number },
  stallTimeoutSeconds: number,
  headSha: string,
  report: ShepherdReport,
  reviewSummaryIds: string[],
): Promise<IterateResult> {
  const runMap = new Map<string, import("../../types.mts").ReranRun>();
  for (const c of transientChecks) {
    if (c.runId === null) continue;
    const existing = runMap.get(c.runId);
    if (existing) {
      existing.checkNames.push(c.name);
    } else {
      runMap.set(c.runId, {
        runId: c.runId,
        checkNames: [c.name],
        failureKind: c.failureKind as "timeout" | "infrastructure",
      });
    }
  }
  const reran = [...runMap.values()];
  const runSummaries = reran.map(
    ({ runId, checkNames, failureKind }) => `${runId} (${checkNames.join(", ")} — ${failureKind})`,
  );
  return applyStallGuard(
    stallKey,
    stallTimeoutSeconds,
    headSha,
    base,
    prNumber,
    {
      ...base,
      action: "rerun_ci" as const,
      reran,
      log: `RERUN NEEDED — ${reran.length} CI run${reran.length === 1 ? "" : "s"}: ${runSummaries.join(", ")}`,
    } as IterateResult,
    report,
    reviewSummaryIds,
  );
}

export async function handleRebase(
  base: IterateResultBase,
  report: ShepherdReport,
  stallKey: { owner: string; repo: string; pr: number },
  stallTimeoutSeconds: number,
  headSha: string,
  prNumber: number,
  reviewSummaryIds: string[],
): Promise<IterateResult> {
  const baseLookup = validateBaseBranch(report.baseBranch);
  if (baseLookup.isFallback) {
    const fallbackEscalateBase: Omit<EscalateDetails, "humanMessage"> = {
      triggers: ["base-branch-unknown"],
      unresolvedThreads: [],
      ambiguousComments: [],
      changesRequestedReviews: [],
      suggestion: buildEscalateSuggestion(["base-branch-unknown"], baseLookup.failureReason),
    };
    return {
      ...base,
      action: "escalate",
      escalate: {
        ...fallbackEscalateBase,
        humanMessage: buildEscalateHumanMessage(fallbackEscalateBase, prNumber),
      },
    };
  }
  return applyStallGuard(
    stallKey,
    stallTimeoutSeconds,
    headSha,
    base,
    prNumber,
    {
      ...base,
      baseBranch: baseLookup.branch,
      action: "rebase" as const,
      rebase: {
        reason: `Branch is behind ${baseLookup.branch} — rebasing to pick up latest changes and clear flaky failures`,
        shellScript: buildRebaseShellScript(baseLookup.branch),
      },
    } as IterateResult,
    report,
    reviewSummaryIds,
  );
}
