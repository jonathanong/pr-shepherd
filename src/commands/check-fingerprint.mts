import { getMergeableState, type RepoInfo } from "../github/client.mts";
import {
  fetchPrFingerprint,
  fingerprintsEqual,
  type PrFingerprint,
} from "../github/fingerprint.mts";
import { fingerprintInputDigest, loadPrFingerprint } from "../state/pr-fingerprint.mts";
import { loadRestSnapshotReport } from "../state/rest-snapshot-report.mts";
import type { RestSnapshotState } from "../github/rest-conditional-scope.mts";
import type { PrShepherdConfig } from "../config/load.mts";
import { hasCheckDrivenActionableWork } from "./check-annotations.mts";
import type { ShepherdReport } from "../types.mts";
import { stripReplayedRuleAutoResolve } from "./rule-auto-resolve-format.mts";
import { getGithubTransport } from "../github/transport.mts";

function reportAllowsFingerprintSkip(report: ShepherdReport): boolean {
  if (report.status === "READY") return false;
  if (report.mergeStatus.state !== "OPEN") return false;
  if (report.mergeQueue?.inQueue === true) return false;
  if (report.mergeQueue?.removalAcknowledged === true) return false;
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
  if (getGithubTransport() === "rest") return null;
  const cached = await loadPrFingerprint(stateKey);
  if (cached?.inputDigest == null || cached.inputDigest !== fingerprintInputDigest(config)) {
    return null;
  }
  if (!reportAllowsFingerprintSkip(cached.report)) return null;
  if (cached.fingerprint.isInMergeQueue) return null;
  if (!cached.fingerprint.checkSuitesComplete) return null;
  if (cached.fingerprint.commentCount > 100) return null;
  if (cached.fingerprint.reviewCount > 100) return null;
  if (cached.fingerprint.threadCount > 20) return null;
  if (cached.fingerprint.hasMultiCommentThreads) return null;
  if (!cached.fingerprint.rulesComplete) return null;
  const live = await fetchPrFingerprint(prNumber, repo);
  if (getGithubTransport() === "rest") return null;
  if (live.isInMergeQueue || !live.checkSuitesComplete) return null;
  if (live.commentCount > 100 || live.reviewCount > 100 || live.threadCount > 20) return null;
  if (live.hasMultiCommentThreads || !live.rulesComplete) return null;
  if (!fingerprintsEqual(cached.fingerprint, live)) return null;
  if (
    !(await cachedReportSurvivesMergeabilityRefresh(
      prNumber,
      repo,
      cached.report,
      cached.fingerprint,
    ))
  ) {
    return null;
  }
  if (getGithubTransport() === "rest") return null;
  return {
    ...stripReplayedRuleAutoResolve(cached.report),
    fingerprintReused: true,
  };
}

/**
 * REST counterpart of `tryReuseFingerprintReport`: after the snapshot reads, reuse the previous
 * report only when every conditional read came back 304 with the same validators it was built
 * from. One uncached pull read still confirms the mergeability GitHub computes lazily.
 */
export async function tryReuseRestSnapshotReport(
  prNumber: number,
  repo: RepoInfo,
  stateKey: { owner: string; repo: string; pr: number },
  config: PrShepherdConfig,
  snapshot: RestSnapshotState | undefined,
): Promise<ShepherdReport | null> {
  if (snapshot === undefined || !snapshot.allNotModified) return null;
  const cached = await loadRestSnapshotReport(stateKey);
  if (cached === null || cached.snapshotDigest !== snapshot.digest) return null;
  if (cached.inputDigest !== fingerprintInputDigest(config)) return null;
  if (!reportAllowsFingerprintSkip(cached.report)) return null;
  const live = await getMergeableState(prNumber, repo.owner, repo.name);
  if (live.state === "MERGED" || live.state === "CLOSED") return null;
  if (live.mergeable !== cached.report.mergeStatus.mergeable) return null;
  if (live.mergeStateStatus !== cached.report.mergeStatus.mergeStateStatus) return null;
  return {
    ...stripReplayedRuleAutoResolve(cached.report),
    fingerprintReused: true,
  };
}

async function cachedReportSurvivesMergeabilityRefresh(
  prNumber: number,
  repo: RepoInfo,
  report: ShepherdReport,
  fingerprint: PrFingerprint,
): Promise<boolean> {
  const restDerived =
    fingerprint.mergeable !== report.mergeStatus.mergeable ||
    fingerprint.mergeStateStatus !== report.mergeStatus.mergeStateStatus;
  if (report.status !== "READY" && report.mergeStatus.status !== "UNKNOWN" && !restDerived) {
    return true;
  }
  const rest = await getMergeableState(prNumber, repo.owner, repo.name);
  if (rest.state === "MERGED" || rest.state === "CLOSED") return false;
  if (rest.mergeable !== report.mergeStatus.mergeable) return false;
  if (rest.mergeStateStatus !== report.mergeStatus.mergeStateStatus) return false;
  return true;
}
