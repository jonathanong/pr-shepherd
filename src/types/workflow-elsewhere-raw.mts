import type { ElsewhereRun } from "./workflow-elsewhere.mts";

/** Raw GitHub GraphQL and REST shapes for merge-queue workflow-elsewhere comparisons. */

export interface ParsedDefaultBranchRuns {
  runs: ElsewhereRun[];
  incomplete: boolean;
  unavailable?: string;
  branch?: string;
  commitsRead: number;
  matched: number;
  matchedComplete: boolean;
  workflowName?: string;
  workflowPath?: string;
}

interface RawElsewhereAnnotation {
  path?: string | null;
  location?: { start?: { line?: number | null } | null } | null;
  message?: string | null;
}

interface RawElsewhereCheckRun {
  name: string;
  conclusion: string | null;
  annotations?: { totalCount?: number; nodes?: Array<RawElsewhereAnnotation | null> } | null;
}

interface RawPageInfo {
  hasNextPage?: boolean;
}

export interface RawElsewhereSuite {
  status?: string | null;
  conclusion?: string | null;
  updatedAt?: string | null;
  branch?: { name?: string | null } | null;
  workflowRun?: {
    databaseId?: number | null;
    event?: string | null;
    updatedAt?: string | null;
    file?: { path?: string | null } | null;
    workflow?: { databaseId?: number | null; name?: string | null } | null;
  } | null;
  checkRuns?: { nodes?: Array<RawElsewhereCheckRun | null> } | null;
}

export interface RawDefaultBranchRunsResponse {
  repository?: {
    defaultBranchRef?: {
      name?: string | null;
      target?: {
        history?: {
          pageInfo?: RawPageInfo | null;
          nodes?: Array<{
            oid: string;
            committedDate: string;
            checkSuites?: {
              pageInfo?: RawPageInfo | null;
              nodes?: Array<RawElsewhereSuite | null>;
            } | null;
          } | null>;
        } | null;
      } | null;
    } | null;
  } | null;
}

export interface RawQueueCommitsResponse {
  repository?: Record<
    string,
    {
      oid?: string;
      checkSuites?: {
        pageInfo?: RawPageInfo | null;
        nodes?: Array<RawElsewhereSuite | null>;
      } | null;
    } | null
  > | null;
}

export interface RestWorkflowRunItem {
  id: number;
  name?: string | null;
  path?: string | null;
  head_sha: string;
  head_branch?: string | null;
  event?: string | null;
  status: string | null;
  conclusion: string | null;
  run_attempt?: number | null;
  created_at: string;
  updated_at?: string | null;
}

export interface RestRunCandidate {
  runId: string;
  headSha: string;
  pr?: number;
  branch?: string;
  runAttempt?: number;
  conclusion: string;
  completedAt: string;
}
