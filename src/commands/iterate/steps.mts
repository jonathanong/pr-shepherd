import { applyStallGuard } from "./stall.mts";
import type {
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
        failureKind: c.failureKind as "timeout" | "cancelled",
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
