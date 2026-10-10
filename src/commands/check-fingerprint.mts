import { getMergeableState, type RepoInfo } from "../github/client.mts";
import { fingerprintsEqual, type PrFingerprint } from "../github/fingerprint.mts";
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

/** Whether a fingerprint's windows cover everything it summarizes, so equality means unchanged. */
function fingerprintIsComplete(fingerprint: PrFingerprint): boolean {
  return (
    !fingerprint.isInMergeQueue &&
    fingerprint.checkSuitesComplete &&
    fingerprint.commentCount <= 100 &&
    fingerprint.reviewCount <= 100 &&
    fingerprint.threadCount <= 20 &&
    !fingerprint.hasMultiCommentThreads &&
    fingerprint.rulesComplete
  );
}

/**
 * GraphQL fingerprint reuse. Returns a decider for `fetchPrBatch`'s first page, or `undefined`
 * when the stored report cannot be reused whatever GitHub says. The decider replays the stored
 * report only when the first page's fingerprint equals the stored one, so a hit costs the one
 * BatchPr request and skips every supplement, and a miss continues the same snapshot.
 */
export async function fingerprintReuser(
  prNumber: number,
  repo: RepoInfo,
  stateKey: { owner: string; repo: string; pr: number },
  config: PrShepherdConfig,
): Promise<((live: PrFingerprint) => Promise<ShepherdReport | null>) | undefined> {
  if (getGithubTransport() === "rest") return undefined;
  const cached = await loadPrFingerprint(stateKey);
  if (cached?.inputDigest == null || cached.inputDigest !== fingerprintInputDigest(config)) {
    return undefined;
  }
  if (!reportAllowsFingerprintSkip(cached.report)) return undefined;
  if (!fingerprintIsComplete(cached.fingerprint)) return undefined;
  return async (live) => {
    if (!fingerprintIsComplete(live) || !fingerprintsEqual(cached.fingerprint, live)) return null;
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
    return {
      ...stripReplayedRuleAutoResolve(cached.report),
      fingerprintReused: true,
    };
  };
}

/**
 * REST counterpart of `fingerprintReuser`: after the snapshot reads, reuse the previous
 * report only when every conditional read came back 304 with the same validators it was built
 * from. No separate mergeability read is made. Mergeability moves when the head or the base
 * moves: the head is in the pull body, and the base branch summary read by
 * `readRestBranchRules` carries the base's `commit.sha`, so a base push answers 200 and blocks
 * reuse. An unsettled `mergeable: null` pull body is never cached, so it cannot answer 304.
 */
export async function tryReuseRestSnapshotReport(
  stateKey: { owner: string; repo: string; pr: number },
  config: PrShepherdConfig,
  snapshot: RestSnapshotState | undefined,
): Promise<ShepherdReport | null> {
  if (snapshot === undefined || !snapshot.allNotModified) return null;
  const cached = await loadRestSnapshotReport(stateKey);
  if (cached === null || cached.snapshotDigest !== snapshot.digest) return null;
  if (cached.inputDigest !== fingerprintInputDigest(config)) return null;
  if (!reportAllowsFingerprintSkip(cached.report)) return null;
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
