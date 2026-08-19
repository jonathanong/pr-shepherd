// Private raw GraphQL response types for the batch PR query.

import type { CommentAuthorAssociation } from "../types/github.mts";
import type { RawPrMergeFields } from "./batch-raw-rules.mts";

export interface RawBatchResponse {
  repository: {
    pullRequest: RawPr | null;
  } | null;
}

export interface RawPr extends RawPrMergeFields {
  id: string;
  number: number;
  state: string;
  isDraft: boolean;
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string | null;
  headRefOid: string;
  headRefName: string;
  headRepository: { nameWithOwner: string } | null;
  baseRefName: string;
  baseRef: import("./batch-raw-rules.mts").RawBaseRef | null;
  reviewRequests: {
    nodes: Array<{
      requestedReviewer: { login?: string; name?: string } | null;
    }>;
  };
  latestReviews: {
    nodes: Array<{
      author: RawAuthor | null;
      state: string;
    }>;
  };
  reviewThreads: {
    pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
    nodes: RawThread[];
  };
  comments: {
    pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
    nodes: RawComment[];
  };
  changesRequestedReviews: {
    pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
    nodes: RawReview[];
  };
  reviewSummaries: {
    pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
    nodes: RawReviewSummary[];
  };
  allReviews?: {
    totalCount: number;
  };
  approvedReviews: {
    pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
    nodes: RawReviewSummary[];
  };
  commits: {
    totalCount?: number;
    nodes: Array<{
      commit: {
        oid: string;
        committedDate?: string;
        checkSuites?: RawCheckSuites;
        statusCheckRollup: {
          contexts: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            nodes: Array<RawContextNode | null>;
          };
        } | null;
      };
    }>;
  };
}

interface RawCheckSuites {
  pageInfo: { hasNextPage: boolean };
  nodes: Array<{
    conclusion: string | null;
    workflowRun: {
      databaseId: number | null;
      event: string | null;
      url: string | null;
      workflow: { name: string | null } | null;
    } | null;
  }>;
}

interface RawAuthor {
  __typename?: string;
  login: string;
}

export interface RawThreadComment {
  id: string;
  isMinimized: boolean;
  url: string;
  authorAssociation?: CommentAuthorAssociation;
  author: RawAuthor | null;
  pullRequestReview?: { id: string } | null;
  body: string;
  path: string | null;
  line: number | null;
  startLine: number | null;
  createdAt?: string;
}

export interface RawThread {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path?: string | null;
  line?: number | null;
  startLine?: number | null;
  comments: {
    pageInfo?: { hasNextPage: boolean; endCursor: string | null };
    nodes: RawThreadComment[];
  };
}

export interface RawReviewThreadCommentsResponse {
  node: {
    __typename?: string;
    comments: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: RawThreadComment[];
    } | null;
  } | null;
}

export interface RawComment {
  id: string;
  isMinimized: boolean;
  url: string;
  authorAssociation?: CommentAuthorAssociation;
  author: RawAuthor | null;
  body: string;
  createdAt?: string;
}

export interface RawReview {
  id: string;
  authorAssociation?: CommentAuthorAssociation;
  author: RawAuthor | null;
  body: string;
  createdAt?: string;
  commit?: { oid: string };
}

export interface RawReviewSummary {
  id: string;
  isMinimized: boolean;
  authorAssociation?: CommentAuthorAssociation;
  author: RawAuthor | null;
  body: string;
  createdAt?: string;
}

export type RawContextNode =
  | {
      __typename: "CheckRun";
      id: string;
      name: string;
      status: string;
      conclusion: string | null;
      detailsUrl: string | null;
      completedAt?: string | null;
      startedAt?: string | null;
      title: string | null;
      summary: string | null;
      checkSuite: {
        createdAt?: string;
        updatedAt?: string;
        workflowRun: {
          event: string;
          createdAt?: string;
          updatedAt?: string;
          workflow?: { name: string; databaseId?: number | null } | null;
        } | null;
      } | null;
    }
  | {
      __typename: "StatusContext";
      context: string;
      state: string;
      createdAt?: string;
      targetUrl: string | null;
      description: string | null;
    };
