import { graphql, type RepoInfo } from "./client.mts";
import { GitHubRequestError } from "./errors.mts";
import { rest } from "./http.mts";
import { DEFAULT_BRANCH_WORKFLOW_RUNS_QUERY } from "./queries.mts";
import { githubOperation } from "./transport.mts";
import { pollRateLimitRetryAfterMs } from "../commands/poll-quota.mts";
import { loadDerived, storeDerived, type StateKey } from "../state/rest-cache.mts";
import type { ElsewhereRun, ElsewhereScope } from "../types/workflow-elsewhere.mts";
import {
  MAX_ELSEWHERE_RUNS_PER_SOURCE,
  parseDefaultBranchRuns,
  sortNewestFirst,
} from "./workflow-elsewhere-parse.mts";
import {
  buildQueueCommitsQuery,
  mergeQueueCommitDetails,
  selectOtherQueueRestRuns,
} from "./workflow-elsewhere-queue.mts";
import { readWorkflowElsewhereRest } from "./workflow-elsewhere-rest.mts";
import { fetchRestWorkflowRunsPaged } from "./workflow-elsewhere-rest-runs.mts";
import type {
  RawDefaultBranchRunsResponse,
  RawQueueCommitsResponse,
} from "../types/workflow-elsewhere-raw.mts";

const MAX_ERROR_CHARS = 120;

export interface ReadWorkflowElsewhereInput {
  repo: RepoInfo;
  prNumber: number;
  workflowId: string;
  workflowName?: string;
  workflowPath?: string;
  currentRunId: string;
  currentCommitOid: string;
  windowStartMs: number;
  since: string;
}

export type WorkflowElsewhereReadResult =
  | { runs: ElsewhereRun[]; scope: ElsewhereScope }
  | { unread: string };

const repoPrefix = (repo: RepoInfo): string =>
  `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;

/** Format an optional workflow-elsewhere read failure into a single-line `unread` reason. */
export function summarizeElsewhereError(error: unknown): string {
  const retry = pollRateLimitRetryAfterMs(error);
  if (retry !== null) {
    return `rate limited, retry after ${Math.max(1, Math.ceil(retry.ms / 1000))}s`;
  }
  if (error instanceof GitHubRequestError) return `HTTP ${error.status}`;
  const raw = error instanceof Error ? error.message : String(error);
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return "request failed";
  return compact.length <= MAX_ERROR_CHARS ? compact : `${compact.slice(0, MAX_ERROR_CHARS - 1)}…`;
}

/** Resolve numeric workflow ID from `GET /actions/runs/{id}` when GraphQL did not include it. */
export async function resolveWorkflowId(
  repo: RepoInfo,
  runId: string,
  stateKey: StateKey,
): Promise<string | undefined> {
  const cacheName = `run-workflow-id:${runId}`;
  const cached = await loadDerived<string>(stateKey, cacheName);
  if (cached && typeof cached.value === "string" && /^\d+$/.test(cached.value)) {
    return cached.value;
  }
  const data = await rest<{ workflow_id?: unknown }>(
    "GET",
    `${repoPrefix(repo)}/actions/runs/${encodeURIComponent(runId)}`,
  );
  const id = data?.workflow_id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return undefined;
  const resolved = String(id);
  await storeDerived(stateKey, cacheName, resolved);
  return resolved;
}

/** Read same-workflow runs on the default branch and other merge-queue entries. */
export async function readWorkflowElsewhere(
  input: ReadWorkflowElsewhereInput,
): Promise<WorkflowElsewhereReadResult> {
  const { repo, workflowId, windowStartMs, since } = input;
  const defaultOutcome = await githubOperation<
    | { kind: "graphql"; data: RawDefaultBranchRunsResponse }
    | { kind: "rest"; result: WorkflowElsewhereReadResult }
  >(
    "WorkflowElsewhereDefault",
    async () => ({
      kind: "graphql",
      data: (
        await graphql<RawDefaultBranchRunsResponse>(DEFAULT_BRANCH_WORKFLOW_RUNS_QUERY, {
          owner: repo.owner,
          repo: repo.name,
        })
      ).data,
    }),
    async () => ({ kind: "rest", result: await readWorkflowElsewhereRest(input) }),
  );
  if (defaultOutcome.kind === "rest") return defaultOutcome.result;
  const defaultParsed = parseDefaultBranchRuns(defaultOutcome.data, workflowId, windowStartMs);
  if (defaultParsed.incomplete) return { unread: "GitHub returned incomplete (null) nodes" };
  if (defaultParsed.unavailable) return { unread: defaultParsed.unavailable };

  // Keep the REST queue listing outside `githubOperation` so a REST error never flips the
  // session transport from GraphQL to REST.
  const wfPath = `${repoPrefix(repo)}/actions/workflows/${encodeURIComponent(workflowId)}/runs`;
  let queueRead: Awaited<ReturnType<typeof fetchRestWorkflowRunsPaged>>;
  try {
    queueRead = await fetchRestWorkflowRunsPaged(
      `${wfPath}?event=merge_group&status=completed`,
      windowStartMs,
      (items) =>
        selectOtherQueueRestRuns(items, {
          prNumber: input.prNumber,
          currentRunId: input.currentRunId,
          currentCommitOid: input.currentCommitOid,
          windowStartMs,
        }),
      MAX_ELSEWHERE_RUNS_PER_SOURCE,
    );
  } catch (error) {
    return { unread: summarizeElsewhereError(error) };
  }
  if ("unread" in queueRead) return queueRead;
  const queueCandidates = queueRead.candidates;
  const oids = [
    ...new Set(queueCandidates.filter((c) => c.conclusion !== "SUCCESS").map((c) => c.headSha)),
  ];
  let queueData: RawQueueCommitsResponse | undefined;
  const oidToAlias = new Map<string, string>();
  if (oids.length > 0) {
    oids.forEach((oid, i) => oidToAlias.set(oid, `c${i}`));
    const { query, variables } = buildQueueCommitsQuery(repo.owner, repo.name, oids);
    const queueOutcome = await githubOperation<
      | { kind: "graphql"; data: RawQueueCommitsResponse }
      | { kind: "rest"; result: WorkflowElsewhereReadResult }
    >(
      "WorkflowElsewhereQueue",
      async () => ({
        kind: "graphql",
        data: (await graphql<RawQueueCommitsResponse>(query, variables)).data,
      }),
      async () => ({ kind: "rest", result: await readWorkflowElsewhereRest(input) }),
    );
    if (queueOutcome.kind === "rest") return queueOutcome.result;
    queueData = queueOutcome.data;
  }
  const queueParsed = mergeQueueCommitDetails(queueCandidates, oidToAlias, queueData);
  if (queueParsed.incomplete) return { unread: "GitHub returned incomplete (null) nodes" };
  if (queueParsed.unavailable) return { unread: queueParsed.unavailable };
  const workflowName = defaultParsed.workflowName ?? queueRead.workflowName ?? input.workflowName;
  const workflowPath = defaultParsed.workflowPath ?? queueRead.workflowPath ?? input.workflowPath;
  const scope: ElsewhereScope = {
    ...(workflowName !== undefined && { workflowName }),
    ...(workflowPath !== undefined && { workflowPath }),
    since,
    defaultBranch: {
      branch: defaultParsed.branch!,
      commitsRead: defaultParsed.commitsRead,
      matched: defaultParsed.matched,
      matchedComplete: defaultParsed.matchedComplete,
      shown: defaultParsed.runs.length,
    },
    mergeQueue: {
      runsRead: queueRead.runsRead,
      matched: queueRead.matched,
      matchedComplete: queueRead.matchedComplete,
      shown: queueParsed.runs.length,
    },
  };
  return { runs: sortNewestFirst([...defaultParsed.runs, ...queueParsed.runs]), scope };
}
