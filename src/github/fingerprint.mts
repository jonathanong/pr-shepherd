import { graphqlWithRateLimit } from "./client.mts";
import { PR_FINGERPRINT_QUERY } from "./queries.mts";
import { GitHubRequestError } from "./errors.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { RepoInfo } from "./client.mts";
import type { RawPr } from "./batch-raw-types.mts";

export interface PrFingerprint {
  headRefOid: string;
  updatedAt: string;
  state: string;
  isDraft: boolean;
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string | null;
  isInMergeQueue: boolean;
  commentCount: number;
  threadCount: number;
  reviewCount: number;
  latestCommentId: string | null;
  latestThreadId: string | null;
  latestReviewId: string | null;
  checkRollupState: string | null;
  checkSuiteConclusions: string;
  viewerCanUpdate: boolean;
  viewerPermission: string | null;
}

interface RawFingerprintResponse {
  repository: {
    viewerPermission: string | null;
    pullRequest: {
      updatedAt: string;
      state: string;
      isDraft: boolean;
      viewerCanUpdate: boolean;
      headRefOid: string;
      mergeable: string;
      mergeStateStatus: string;
      reviewDecision: string | null;
      isInMergeQueue: boolean;
      comments: { totalCount: number; nodes: Array<{ id: string }> };
      reviewThreads: { totalCount: number; nodes: Array<{ id: string }> };
      reviews: { totalCount: number; nodes: Array<{ id: string }> };
      commits: {
        nodes: Array<{
          commit: {
            oid: string;
            statusCheckRollup: { state: string | null } | null;
            checkSuites?: { nodes: Array<{ conclusion: string | null }> };
          };
        }>;
      };
    } | null;
  } | null;
}

function suiteConclusions(nodes: Array<{ conclusion: string | null }> | undefined): string {
  return (nodes ?? []).map((node) => node.conclusion ?? "").join(",");
}

export function fingerprintFromRaw(
  raw: RawPr,
  viewerPermission: string | null = null,
): PrFingerprint {
  return {
    headRefOid: raw.headRefOid,
    updatedAt: raw.updatedAt ?? "",
    state: raw.state,
    isDraft: raw.isDraft,
    mergeable: raw.mergeable,
    mergeStateStatus: raw.mergeStateStatus,
    reviewDecision: raw.reviewDecision,
    isInMergeQueue: Boolean(raw.isInMergeQueue),
    commentCount: raw.comments.totalCount ?? raw.comments.nodes.length,
    threadCount: raw.reviewThreads.totalCount ?? raw.reviewThreads.nodes.length,
    reviewCount: raw.allReviews?.totalCount ?? 0,
    latestCommentId: raw.comments.nodes.at(-1)?.id ?? null,
    latestThreadId: raw.reviewThreads.nodes.at(-1)?.id ?? null,
    latestReviewId: raw.allReviews?.nodes?.at(-1)?.id ?? null,
    checkRollupState: raw.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null,
    checkSuiteConclusions: suiteConclusions(raw.commits.nodes[0]?.commit.checkSuites?.nodes),
    viewerCanUpdate: raw.viewerCanUpdate === true,
    viewerPermission,
  };
}

export function fingerprintsEqual(left: PrFingerprint, right: PrFingerprint): boolean {
  return (
    left.headRefOid === right.headRefOid &&
    left.updatedAt === right.updatedAt &&
    left.state === right.state &&
    left.isDraft === right.isDraft &&
    left.mergeable === right.mergeable &&
    left.mergeStateStatus === right.mergeStateStatus &&
    left.reviewDecision === right.reviewDecision &&
    left.isInMergeQueue === right.isInMergeQueue &&
    left.commentCount === right.commentCount &&
    left.threadCount === right.threadCount &&
    left.reviewCount === right.reviewCount &&
    left.latestCommentId === right.latestCommentId &&
    left.latestThreadId === right.latestThreadId &&
    left.latestReviewId === right.latestReviewId &&
    left.checkRollupState === right.checkRollupState &&
    left.checkSuiteConclusions === right.checkSuiteConclusions &&
    left.viewerCanUpdate === right.viewerCanUpdate &&
    left.viewerPermission === right.viewerPermission
  );
}

export async function fetchPrFingerprint(pr: number, repo: RepoInfo): Promise<PrFingerprint> {
  const result = await graphqlWithRateLimit<RawFingerprintResponse>(PR_FINGERPRINT_QUERY, {
    owner: repo.owner,
    repo: repo.name,
    pr,
  });
  if (!result.data.repository) {
    throw new GitHubRequestError(
      `GitHub GraphQL response did not include repository ${repo.owner}/${repo.name} (not found or access denied)`,
      { status: 200 },
    );
  }
  const raw = result.data.repository.pullRequest;
  if (!raw) throw new ShepherdError(`PR #${pr} not found`, EXIT.UNAVAILABLE);
  const comments = raw.comments;
  const threads = raw.reviewThreads;
  const reviews = raw.reviews;
  return {
    headRefOid: raw.headRefOid,
    updatedAt: raw.updatedAt,
    state: raw.state,
    isDraft: raw.isDraft,
    mergeable: raw.mergeable,
    mergeStateStatus: raw.mergeStateStatus,
    reviewDecision: raw.reviewDecision,
    isInMergeQueue: Boolean(raw.isInMergeQueue),
    commentCount: comments.totalCount,
    threadCount: threads.totalCount,
    reviewCount: reviews.totalCount,
    latestCommentId: comments.nodes.at(-1)?.id ?? null,
    latestThreadId: threads.nodes.at(-1)?.id ?? null,
    latestReviewId: reviews.nodes.at(-1)?.id ?? null,
    checkRollupState: raw.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null,
    checkSuiteConclusions: suiteConclusions(raw.commits.nodes[0]?.commit.checkSuites?.nodes),
    viewerCanUpdate: raw.viewerCanUpdate === true,
    viewerPermission: result.data.repository.viewerPermission,
  };
}
