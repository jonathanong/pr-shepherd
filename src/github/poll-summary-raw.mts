export interface RawAuthor {
  __typename?: string;
  login: string;
}

interface RawSummaryComment {
  id: string;
  body: string;
  isMinimized: boolean;
  viewerDidAuthor?: boolean;
  author: RawAuthor | null;
}

interface SummaryConnection<T> {
  totalCount: number;
  pageInfo: { hasPreviousPage: boolean };
  nodes: T[];
}

type RawCheckContext =
  | {
      __typename: "CheckRun";
      name: string;
      status: string;
      conclusion: string | null;
      checkSuite: { workflowRun: { event: string } | null } | null;
    }
  | { __typename: "StatusContext"; state: string };

export interface RawSummaryPr {
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  viewerCanUpdate: boolean;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string | null;
  isInMergeQueue: boolean;
  stack: { number: number; size: number; baseRefName: string } | null;
  stackEntry: { position: number } | null;
  comments: SummaryConnection<RawSummaryComment>;
  reviews: SummaryConnection<RawSummaryComment & { state: string }>;
  reviewThreads: SummaryConnection<{
    id: string;
    isResolved: boolean;
    isOutdated: boolean;
    comments: SummaryConnection<RawSummaryComment>;
  }>;
  commits: {
    nodes: Array<{
      commit: {
        statusCheckRollup: {
          state: string | null;
          contexts: SummaryConnection<RawCheckContext>;
        } | null;
      };
    }>;
  };
}

export interface RawExplicitResponse {
  repository: Record<string, RawSummaryPr | null> | null;
}

export interface RawStackResponse {
  repository: {
    pullRequest: {
      stack: {
        id: string;
        number: number;
        size: number;
        baseRefName: string;
        entries: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{ position: number; pullRequest: RawSummaryPr | null }>;
        };
      } | null;
    } | null;
  } | null;
}
