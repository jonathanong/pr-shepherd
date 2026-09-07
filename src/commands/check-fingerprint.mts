import { getMergeableState, type RepoInfo } from "../github/client.mts";
import { fetchPrFingerprint, fingerprintsEqual } from "../github/fingerprint.mts";
import { fingerprintInputDigest, loadPrFingerprint } from "../state/pr-fingerprint.mts";
import type { PrShepherdConfig } from "../config/load.mts";
import { hasCheckDrivenActionableWork } from "./check-annotations.mts";
import type { ShepherdReport } from "../types.mts";

function reportAllowsFingerprintSkip(report: ShepherdReport): boolean {
  if (report.mergeStatus.state !== "OPEN") return false;
  if (report.mergeQueue?.inQueue === true) return false;
  return (
    report.threads.actionable.length === 0 &&
    report.threads.resolutionOnly.length === 0 &&
    report.threads.firstLook.length === 0 &&
    (report.threads.ruleAutoResolveIds?.length ?? 0) === 0 &&
    report.comments.actionable.length === 0 &&
    (report.comments.minimizeIds?.length ?? 0) === 0 &&
    report.comments.firstLook.length === 0 &&
    report.changesRequestedReviews.length === 0 &&
    report.approvedReviews.length === 0 &&
    report.firstLookSummaries.length === 0 &&
    report.editedSummaries.length === 0 &&
    (report.ruleAutoResolveReviewSummaryIds?.length ?? 0) === 0 &&
    !hasCheckDrivenActionableWork(report.checks, report.mergeStatus.status)
  );
}

export async function tryReuseFingerprintReport(
  prNumber: number,
  repo: RepoInfo,
  stateKey: { owner: string; repo: string; pr: number },
  config: PrShepherdConfig,
): Promise<ShepherdReport | null> {
  const cached = await loadPrFingerprint(stateKey);
  if (cached?.inputDigest == null || cached.inputDigest !== fingerprintInputDigest(config)) {
    return null;
  }
  if (!reportAllowsFingerprintSkip(cached.report)) return null;
  const live = await fetchPrFingerprint(prNumber, repo);
  if (live.isInMergeQueue || cached.fingerprint.isInMergeQueue) return null;
  if (!live.checkSuitesComplete || !cached.fingerprint.checkSuitesComplete) return null;
  if (
    cached.report.status === "READY" &&
    (live.mergePolicy === "" || cached.fingerprint.mergePolicy === "")
  ) {
    return null;
  }
  if (!fingerprintsEqual(cached.fingerprint, live)) return null;
  if (!(await cachedReportSurvivesMergeabilityRefresh(prNumber, repo, cached.report))) {
    return null;
  }
  return cached.report;
}

async function cachedReportSurvivesMergeabilityRefresh(
  prNumber: number,
  repo: RepoInfo,
  report: ShepherdReport,
): Promise<boolean> {
  if (report.status !== "READY" && report.mergeStatus.status !== "UNKNOWN") return true;
  const rest = await getMergeableState(prNumber, repo.owner, repo.name);
  if (rest.state === "MERGED" || rest.state === "CLOSED") return false;
  if (rest.mergeable !== report.mergeStatus.mergeable) return false;
  if (rest.mergeStateStatus !== report.mergeStatus.mergeStateStatus) return false;
  return true;
}
