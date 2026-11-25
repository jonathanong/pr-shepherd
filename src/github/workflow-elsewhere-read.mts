import { graphql, type RepoInfo } from "./client.mts";
import { rest } from "./http.mts";
import { DEFAULT_BRANCH_WORKFLOW_RUNS_QUERY } from "./queries.mts";
import { githubOperation } from "./transport.mts";
import { loadDerived, storeDerived, type StateKey } from "../state/rest-cache.mts";
import type { ElsewhereRun } from "../types/workflow-elsewhere.mts";
import { parseDefaultBranchRuns } from "./workflow-elsewhere-parse.mts";
import {
  buildQueueCommitsQuery,
  mergeQueueCommitDetails,
  selectOtherQueueRestRuns,
} from "./workflow-elsewhere-queue.mts";
import { readWorkflowElsewhereRest } from "./workflow-elsewhere-rest.mts";
import type {
  RawDefaultBranchRunsResponse,
  RawQueueCommitsResponse,
  RestWorkflowRunItem,
} from "../types/workflow-elsewhere-raw.mts";

const REST_RUNS_PER_PAGE = 20;

export interface ReadWorkflowElsewhereInput {
  repo: RepoInfo;
  prNumber: number;
  workflowId: string;
  currentRunId: string;
  currentCommitOid: string;
  windowStartMs: number;
  since: string;
}

export type WorkflowElsewhereReadResult =
  | { runs: ElsewhereRun[]; since: string }
  | { unread: string };

interface RestRunsPayload {
  workflow_runs?: RestWorkflowRunItem[];
}

const repoPrefix = (repo: RepoInfo): string =>
  `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;

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

async function readWorkflowElsewhereGraphql(
  input: ReadWorkflowElsewhereInput,
): Promise<WorkflowElsewhereReadResult> {
  const { repo, workflowId, windowStartMs, since } = input;
  const { data: defaultData } = await graphql<RawDefaultBranchRunsResponse>(
    DEFAULT_BRANCH_WORKFLOW_RUNS_QUERY,
    { owner: repo.owner, repo: repo.name, since },
  );
  const defaultParsed = parseDefaultBranchRuns(defaultData, workflowId, windowStartMs);
  if (defaultParsed.incomplete) return { unread: "GitHub returned incomplete (null) nodes" };
  if (defaultParsed.unavailable) return { unread: defaultParsed.unavailable };

  const queuePayload = await rest<RestRunsPayload>(
    "GET",
    `${repoPrefix(repo)}/actions/workflows/${encodeURIComponent(workflowId)}/runs?event=merge_group&status=completed&created=${encodeURIComponent(`>=${since}`)}&per_page=${REST_RUNS_PER_PAGE}`,
  );
  if (!Array.isArray(queuePayload?.workflow_runs)) {
    return { unread: "malformed merge-queue workflow runs response" };
  }
  const queueCandidates = selectOtherQueueRestRuns(queuePayload.workflow_runs, {
    prNumber: input.prNumber,
    currentRunId: input.currentRunId,
    currentCommitOid: input.currentCommitOid,
    windowStartMs,
  });
  const oids = [
    ...new Set(queueCandidates.filter((c) => c.conclusion !== "SUCCESS").map((c) => c.headSha)),
  ];
  let queueData: RawQueueCommitsResponse | undefined;
  const oidToAlias = new Map<string, string>();
  if (oids.length > 0) {
    oids.forEach((oid, i) => oidToAlias.set(oid, `c${i}`));
    const { query, variables } = buildQueueCommitsQuery(repo.owner, repo.name, oids);
    queueData = (await graphql<RawQueueCommitsResponse>(query, variables)).data;
  }
  const queueParsed = mergeQueueCommitDetails(queueCandidates, oidToAlias, queueData);
  if (queueParsed.incomplete) return { unread: "GitHub returned incomplete (null) nodes" };
  return { runs: [...defaultParsed.runs, ...queueParsed.runs], since };
}

/** Read same-workflow runs on the default branch and other merge-queue entries. */
export function readWorkflowElsewhere(
  input: ReadWorkflowElsewhereInput,
): Promise<WorkflowElsewhereReadResult> {
  return githubOperation(
    "WorkflowElsewhere",
    () => readWorkflowElsewhereGraphql(input),
    () => readWorkflowElsewhereRest(input),
  );
}
