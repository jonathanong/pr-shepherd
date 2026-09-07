import { graphqlWithRateLimit } from "./client.mts";
import { PR_FINGERPRINT_QUERY } from "./queries.mts";
import { GitHubRequestError } from "./errors.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import {
  commentRevisions,
  mergePolicyFingerprint,
  suiteFingerprint,
  type FingerprintComment,
  type FingerprintSuites,
} from "./fingerprint-fields.mts";
import type { RepoInfo } from "./client.mts";
import type { RawPr } from "./batch-raw-types.mts";
import type { RawBaseRef } from "./batch-raw-rules.mts";

export interface PrFingerprint {
  headRefOid: string;
  updatedAt: string;
  state: string;
  isDraft: boolean;
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string | null;
  isInMergeQueue: boolean;
  isMergeQueueEnabled: boolean;
  mergePolicy: string;
  commentCount: number;
  commentRevisions: string;
  threadCount: number;
  reviewCount: number;
  reviewRevisions: string;
  latestCommentId: string | null;
  latestThreadId: string | null;
  latestReviewId: string | null;
  checkRollupState: string | null;
  checkSuiteConclusions: string;
  checkSuitesComplete: boolean;
  viewerCanUpdate: boolean;
  viewerPermission: string | null;
  viewerLogin: string | null;
}

interface FingerprintSource {
  headRefOid: string;
  updatedAt?: string;
  state: string;
  isDraft: boolean;
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string | null;
  isInMergeQueue?: boolean;
  isMergeQueueEnabled?: boolean;
  viewerCanUpdate?: boolean;
  baseRef?: RawBaseRef | null;
  comments: { totalCount?: number; nodes: FingerprintComment[] };
  reviewThreads: { totalCount?: number; nodes: Array<{ id: string }> };
  commits: {
    nodes: Array<{
      commit: {
        statusCheckRollup: { state?: string | null } | null;
        checkSuites?: FingerprintSuites;
      };
    }>;
  };
}

interface RawFingerprintResponse {
  viewer?: { login: string | null } | null;
  repository: {
    viewerPermission: string | null;
    pullRequest:
      | (FingerprintSource & {
          updatedAt: string;
          isInMergeQueue: boolean;
          isMergeQueueEnabled: boolean;
          viewerCanUpdate: boolean;
          comments: { totalCount: number; nodes: FingerprintComment[] };
          reviewThreads: { totalCount: number; nodes: Array<{ id: string }> };
          reviews: { totalCount: number; nodes: FingerprintComment[] };
          baseRef: RawBaseRef | null;
        })
      | null;
  } | null;
}

function coreFingerprint(
  raw: FingerprintSource,
  counts: { reviewCount: number; latestReviewId: string | null; reviewRevisions: string },
  viewer: { permission: string | null; login: string | null },
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
    isMergeQueueEnabled: Boolean(raw.isMergeQueueEnabled),
    mergePolicy: mergePolicyFingerprint(raw),
    commentCount: raw.comments.totalCount ?? raw.comments.nodes.length,
    commentRevisions: commentRevisions(raw.comments.nodes),
    threadCount: raw.reviewThreads.totalCount ?? raw.reviewThreads.nodes.length,
    reviewCount: counts.reviewCount,
    reviewRevisions: counts.reviewRevisions,
    latestCommentId: raw.comments.nodes.at(-1)?.id ?? null,
    latestThreadId: raw.reviewThreads.nodes.at(-1)?.id ?? null,
    latestReviewId: counts.latestReviewId,
    checkRollupState: raw.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null,
    ...suiteFingerprint(raw.commits.nodes[0]?.commit.checkSuites),
    viewerCanUpdate: raw.viewerCanUpdate === true,
    viewerPermission: viewer.permission,
    viewerLogin: viewer.login,
  };
}

export function fingerprintFromRaw(
  raw: RawPr,
  viewerPermission: string | null = null,
  viewerLogin: string | null = null,
): PrFingerprint {
  return coreFingerprint(
    raw,
    {
      reviewCount: raw.allReviews?.totalCount ?? 0,
      latestReviewId: raw.allReviews?.nodes?.at(-1)?.id ?? null,
      reviewRevisions: commentRevisions(raw.allReviews?.nodes ?? []),
    },
    { permission: viewerPermission, login: viewerLogin },
  );
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
    left.isMergeQueueEnabled === right.isMergeQueueEnabled &&
    left.mergePolicy === right.mergePolicy &&
    left.commentCount === right.commentCount &&
    left.commentRevisions === right.commentRevisions &&
    left.threadCount === right.threadCount &&
    left.reviewCount === right.reviewCount &&
    left.reviewRevisions === right.reviewRevisions &&
    left.latestCommentId === right.latestCommentId &&
    left.latestThreadId === right.latestThreadId &&
    left.latestReviewId === right.latestReviewId &&
    left.checkRollupState === right.checkRollupState &&
    left.checkSuiteConclusions === right.checkSuiteConclusions &&
    left.checkSuitesComplete === right.checkSuitesComplete &&
    left.viewerCanUpdate === right.viewerCanUpdate &&
    left.viewerPermission === right.viewerPermission &&
    left.viewerLogin === right.viewerLogin
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
  return coreFingerprint(
    raw,
    {
      reviewCount: raw.reviews.totalCount,
      latestReviewId: raw.reviews.nodes.at(-1)?.id ?? null,
      reviewRevisions: commentRevisions(raw.reviews.nodes),
    },
    {
      permission: result.data.repository.viewerPermission,
      login: result.data.viewer?.login ?? null,
    },
  );
}
