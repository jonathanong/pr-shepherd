import {
  commentRevisions,
  mergePolicyFingerprint,
  rulesComplete,
  stackKey,
  suiteFingerprint,
  hasMultiCommentThreads,
  threadCommentRevisions,
} from "./fingerprint-fields.mts";
import type { RawPr } from "./batch-raw-types.mts";

/**
 * Summary of BatchPr's first page. Two equal fingerprints mean the first page is unchanged, as
 * long as every window it summarizes is complete (see `fingerprintReuser`).
 */
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
  stackKey: string;
  threadCommentRevisions: string;
  rulesComplete: boolean;
  hasMultiCommentThreads: boolean;
}

export function fingerprintFromRaw(
  raw: RawPr,
  viewerPermission: string | null = null,
  viewerLogin: string | null = null,
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
    reviewCount: raw.allReviews?.totalCount ?? 0,
    reviewRevisions: commentRevisions(raw.allReviews?.nodes ?? []),
    latestCommentId: raw.comments.nodes.at(-1)?.id ?? null,
    latestThreadId: raw.reviewThreads.nodes.at(-1)?.id ?? null,
    latestReviewId: raw.allReviews?.nodes?.at(-1)?.id ?? null,
    checkRollupState: raw.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null,
    ...suiteFingerprint(raw.commits.nodes[0]?.commit.checkSuites),
    viewerCanUpdate: raw.viewerCanUpdate === true,
    viewerPermission,
    viewerLogin,
    stackKey: stackKey(raw),
    threadCommentRevisions: threadCommentRevisions(raw.reviewThreads.nodes),
    rulesComplete: rulesComplete(raw.baseRef),
    hasMultiCommentThreads: hasMultiCommentThreads(raw.reviewThreads.nodes),
  };
}

export function fingerprintsEqual(left: PrFingerprint, right: PrFingerprint): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
