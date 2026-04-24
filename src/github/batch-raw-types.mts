// Private raw GraphQL response types for the batch PR query.

export interface RawBatchResponse {
  repository: {
    pullRequest: RawPr | null;
  };
}

export interface RawPr {
  id: string;
  number: number;
  state: string;
  isDraft: boolean;
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string | null;
  headRefOid: string;
  baseRefName: string;
  reviewRequests: {
    nodes: Array<{
      requestedReviewer: { login?: string; name?: string } | null;
    }>;
  };
  latestReviews: {
    nodes: Array<{
      author: { login: string } | null;
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
  approvedReviews: {
    pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
    nodes: RawReviewSummary[];
  };
  commits: {
    nodes: Array<{
      commit: {
        oid: string;
        statusCheckRollup: {
          contexts: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            nodes: RawContextNode[];
          };
        } | null;
      };
    }>;
  };
}

export interface RawThread {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  comments: {
    nodes: Array<{
      id: string;
      isMinimized: boolean;
      author: { login: string } | null;
      body: string;
      path: string | null;
      line: number | null;
      startLine: number | null;
      createdAt: string;
    }>;
  };
}

export interface RawComment {
  id: string;
  isMinimized: boolean;
  author: { login: string } | null;
  body: string;
  createdAt: string;
}

export interface RawReview {
  id: string;
  author: { login: string } | null;
  body: string;
}

export interface RawReviewSummary {
  id: string;
  isMinimized: boolean;
  author: { login: string } | null;
  body: string;
}

export type RawContextNode =
  | {
      __typename: "CheckRun";
      name: string;
      status: string;
      conclusion: string | null;
      detailsUrl: string | null;
      title: string | null;
      summary: string | null;
      checkSuite: { workflowRun: { event: string } | null } | null;
    }
  | {
      __typename: "StatusContext";
      context: string;
      state: string;
      targetUrl: string | null;
      description: string | null;
    };
