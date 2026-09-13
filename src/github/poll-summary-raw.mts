export interface RawAuthor {
  __typename?: string;
  login: string;
}

interface RawSummaryComment {
  id: string;
  body: string;
  isMinimized: boolean;
  viewerDidAuthor?: boolean;
  authorAssociation?: string;
  url?: string;
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
      id?: string;
      name: string;
      status: string;
      conclusion: string | null;
      detailsUrl?: string;
      checkSuite: {
        workflowRun: {
          databaseId?: string | number;
          event: string;
          workflow?: { name: string; databaseId: string | number } | null;
        } | null;
      } | null;
    }
  | { __typename: "StatusContext"; context: string; state: string };

interface RawCheckRollup {
  contexts: SummaryConnection<RawCheckContext>;
}

export interface RawSummaryPr {
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  viewerCanUpdate: boolean;
  headRefName: string;
  headRefOid: string;
  baseRefOid: string;
  baseRefName: string;
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string | null;
  reviewRequests?: { nodes: Array<{ requestedReviewer: RawAuthor | null }> };
  latestReviews?: { nodes: Array<{ state: string; author: RawAuthor | null }> };
  isInMergeQueue: boolean;
  mergeQueueEntry: { headCommit: { statusCheckRollup: RawCheckRollup | null } | null } | null;
  stack: { number: number; size: number; baseRefName: string } | null;
  stackEntry: { position: number } | null;
  comments: SummaryConnection<RawSummaryComment>;
  reviews: SummaryConnection<RawSummaryComment & { state: string }>;
  reviewThreads: SummaryConnection<{
    id: string;
    isResolved: boolean;
    isOutdated: boolean;
    path: string | null;
    rootComments?: { nodes: RawSummaryComment[] };
    comments: SummaryConnection<RawSummaryComment>;
  }>;
  commits: {
    nodes: Array<{
      commit: {
        statusCheckRollup: RawCheckRollup | null;
      };
    }>;
  };
}

export interface RawExplicitResponse {
  repository:
    | ({ viewerCanAdminister: boolean } & Record<string, RawSummaryPr | boolean | null>)
    | null;
}

export interface RawStackResponse {
  repository: {
    viewerCanAdminister: boolean;
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
