import type { RepoInfo } from "../github/client.mts";
import { fingerprintsEqual, type PrFingerprint } from "../github/fingerprint.mts";
import {
  readRest,
  readRestPages,
  restCollection,
  restObject,
  restRepoPath,
  restString,
} from "../github/rest-reader-core.mts";
import { restSnapshotState, withRestConditionalScope } from "../github/rest-conditional-scope.mts";
import { getGithubTransport } from "../github/transport.mts";
import { GitHubRequestError } from "../github/errors.mts";
import { rateLimitKind } from "../github/rate-limit-kind.mts";
import type { PrShepherdConfig } from "../config/load.mts";
import {
  attachWaitDetectors,
  fingerprintInputDigest,
  loadPrFingerprint,
  type StoredPrFingerprint,
} from "../state/pr-fingerprint.mts";
import type { ShepherdReport } from "../types.mts";
import { fingerprintIsComplete, reportAllowsFingerprintSkip } from "./check-fingerprint.mts";
import { stripReplayedRuleAutoResolve } from "./rule-auto-resolve-format.mts";

type StateKey = { owner: string; repo: string; pr: number };

/**
 * Outcome of the GraphQL transport's REST change detectors. `reused` replays the stored report
 * without any GraphQL request. Otherwise `digest` is what the detectors read before this tick's
 * GraphQL snapshot, recorded beside the new report by `recordWaitDetectors`.
 */
export type WaitDetectorResult =
  | { reused: ShepherdReport; baseTipOid: string }
  | { digest: string; readAt: number };

/**
 * Whether conditional REST reads can stand in for the GraphQL snapshot of this stored report.
 * Only an idle wait qualifies: nothing to act on, no check still running, a settled single-PR
 * merge state from GraphQL, and a fingerprint whose windows cover everything it summarizes.
 */
function detectorsCover(stored: StoredPrFingerprint): boolean {
  const { report, fingerprint } = stored;
  return (
    report.transport === undefined &&
    report.headSha !== undefined &&
    reportAllowsFingerprintSkip(report) &&
    fingerprintIsComplete(fingerprint) &&
    report.checks.inProgress.length === 0 &&
    report.actionsWorkflowInProgress !== true &&
    report.mergeStatus.status !== "UNKNOWN" &&
    report.mergeStatus.mergeRequirements?.stack === undefined &&
    fingerprint.stackKey === "" &&
    fingerprint.mergeable === report.mergeStatus.mergeable &&
    fingerprint.mergeStateStatus === report.mergeStatus.mergeStateStatus
  );
}

/**
 * Read the PR's REST change detectors: the pull, the head's check runs, check suites and
 * statuses, the three feedback lists, and the base branch. Every read is conditional, so an
 * unchanged resource answers a free 304.
 */
async function readDetectors(
  prNumber: number,
  repo: RepoInfo,
  report: ShepherdReport,
): Promise<string> {
  const prefix = restRepoPath(repo);
  const head = encodeURIComponent(report.headSha!);
  await readRest("GET", `${prefix}/pulls/${prNumber}`);
  await readRestPages(`${prefix}/commits/${head}/check-runs?filter=latest`, (body) =>
    restCollection(body, "check_runs"),
  );
  await readRestPages(`${prefix}/commits/${head}/check-suites`, (body) =>
    restCollection(body, "check_suites"),
  );
  await readRestPages(`${prefix}/commits/${head}/statuses`);
  await readRestPages(`${prefix}/pulls/${prNumber}/reviews`);
  await readRestPages(`${prefix}/issues/${prNumber}/comments`);
  await readRestPages(`${prefix}/pulls/${prNumber}/comments`);
  const branch = restObject(
    await readRest("GET", `${prefix}/branches/${encodeURIComponent(report.baseBranch)}`),
    "base branch",
  );
  return restString(restObject(branch.commit, "base branch commit").sha, "base branch sha");
}

/**
 * On the GraphQL transport, run the REST change detectors for an idle stored report. Returns
 * `undefined` when the detectors do not apply. A detector failure never reaches the GraphQL
 * transport's fallback: the tick just takes its ordinary GraphQL path. A secondary rate limit
 * is rethrown so the tick aborts and polling backs off.
 */
export async function readWaitDetectors(
  prNumber: number,
  repo: RepoInfo,
  stateKey: StateKey,
  config: PrShepherdConfig,
  now = Date.now(),
): Promise<WaitDetectorResult | undefined> {
  const reconcileMs = config.poll.reconcileSeconds * 1000;
  if (reconcileMs === 0 || getGithubTransport() === "rest") return undefined;
  const stored = await loadPrFingerprint(stateKey);
  if (stored === null || stored.inputDigest !== fingerprintInputDigest(config)) return undefined;
  if (!detectorsCover(stored)) return undefined;
  let observed: { baseTipOid: string; state: ReturnType<typeof restSnapshotState> };
  try {
    observed = await withRestConditionalScope(stateKey, async () => {
      const baseTipOid = await readDetectors(prNumber, repo, stored.report);
      return { baseTipOid, state: restSnapshotState() };
    });
  } catch (error) {
    // A secondary limit aborts the tick, as at the other REST call sites, so polling backs off.
    if (error instanceof GitHubRequestError && rateLimitKind(error) === "secondary") throw error;
    return undefined;
  }
  const state = observed.state!;
  const previous = stored.detectors;
  if (
    state.allNotModified &&
    previous?.digest === state.digest &&
    typeof previous.fullAt === "number" &&
    now - previous.fullAt < reconcileMs
  ) {
    return {
      reused: { ...stripReplayedRuleAutoResolve(stored.report), fingerprintReused: true },
      baseTipOid: observed.baseTipOid,
    };
  }
  return { digest: state.digest, readAt: now };
}

/**
 * After a GraphQL tick, store the digest its detectors read beside the report that tick built.
 * `fingerprint` is the tick's live fingerprint; the stored entry must be the one it wrote (or
 * the unchanged entry a fingerprint hit replayed), so a stale report never gains a digest.
 */
export async function recordWaitDetectors(
  stateKey: StateKey,
  config: PrShepherdConfig,
  detectors: WaitDetectorResult | undefined,
  fingerprint: PrFingerprint | undefined,
): Promise<void> {
  if (detectors === undefined || "reused" in detectors) return;
  const stored = await loadPrFingerprint(stateKey);
  if (stored === null || stored.inputDigest !== fingerprintInputDigest(config)) return;
  if (fingerprint !== undefined && !fingerprintsEqual(stored.fingerprint, fingerprint)) return;
  if (!detectorsCover(stored)) return;
  await attachWaitDetectors(stateKey, stored, {
    digest: detectors.digest,
    fullAt: detectors.readAt,
  });
}
