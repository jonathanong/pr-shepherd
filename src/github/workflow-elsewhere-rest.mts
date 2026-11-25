import type { RepoInfo } from "./client.mts";
import { rest } from "./http.mts";
import { mapPool } from "../util/pool.mts";
import type {
  ElsewhereAnnotation,
  ElsewhereFailedJob,
  ElsewhereRun,
} from "../types/workflow-elsewhere.mts";
import {
  MAX_ELSEWHERE_ANNOTATIONS,
  MAX_ELSEWHERE_FAILED_JOBS,
  normalizeAnnotationMessage,
} from "./workflow-elsewhere-parse.mts";
import {
  selectDefaultBranchRestRuns,
  selectOtherQueueRestRuns,
} from "./workflow-elsewhere-queue.mts";
import type { RestRunCandidate, RestWorkflowRunItem } from "../types/workflow-elsewhere-raw.mts";
import type {
  ReadWorkflowElsewhereInput,
  WorkflowElsewhereReadResult,
} from "./workflow-elsewhere-read.mts";

const REST_RUNS_PER_PAGE = 20;

interface RestRunsPayload {
  workflow_runs?: RestWorkflowRunItem[];
}

interface RestJobsPayload {
  jobs?: Array<{ id: number; name: string; conclusion: string | null }>;
}

interface RestAnnotationItem {
  path?: string | null;
  start_line?: number | null;
  message?: string | null;
}

const repoPrefix = (repo: RepoInfo): string =>
  `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;

async function hydrateRestFailedJobs(
  repo: RepoInfo,
  candidate: RestRunCandidate,
): Promise<ElsewhereFailedJob[]> {
  if (candidate.conclusion === "SUCCESS") return [];
  const jobsPayload = await rest<RestJobsPayload>(
    "GET",
    `${repoPrefix(repo)}/actions/runs/${encodeURIComponent(candidate.runId)}/jobs?filter=latest&per_page=100`,
  );
  const failed = (jobsPayload?.jobs ?? [])
    .filter((job) => {
      const c = job.conclusion?.toUpperCase();
      return c === "FAILURE" || c === "TIMED_OUT";
    })
    .slice(0, MAX_ELSEWHERE_FAILED_JOBS);
  return mapPool(failed, 4, async (job): Promise<ElsewhereFailedJob> => {
    const rawAnnotations = await rest<RestAnnotationItem[]>(
      "GET",
      `${repoPrefix(repo)}/check-runs/${job.id}/annotations?per_page=${MAX_ELSEWHERE_ANNOTATIONS}`,
    );
    const annotations: ElsewhereAnnotation[] = (Array.isArray(rawAnnotations) ? rawAnnotations : [])
      .slice(0, MAX_ELSEWHERE_ANNOTATIONS)
      .map((ann) => ({
        path: (ann.path ?? "").trim(),
        line: typeof ann.start_line === "number" && ann.start_line > 0 ? ann.start_line : null,
        message: normalizeAnnotationMessage(ann.message),
      }));
    return { name: job.name, conclusion: job.conclusion!.toUpperCase(), annotations };
  });
}

/** REST transport reader for same-workflow runs on the default branch and other queue entries. */
export async function readWorkflowElsewhereRest(
  input: ReadWorkflowElsewhereInput,
): Promise<WorkflowElsewhereReadResult> {
  const { repo, workflowId, windowStartMs, since } = input;
  const repoPayload = await rest<{ default_branch?: unknown }>("GET", repoPrefix(repo));
  if (typeof repoPayload?.default_branch !== "string" || !repoPayload.default_branch) {
    return { unread: "default branch unavailable" };
  }
  const branch = repoPayload.default_branch;
  const wfPath = `${repoPrefix(repo)}/actions/workflows/${encodeURIComponent(workflowId)}/runs`;
  const [defaultPayload, queuePayload] = await Promise.all([
    rest<RestRunsPayload>(
      "GET",
      `${wfPath}?branch=${encodeURIComponent(branch)}&status=completed&created=${encodeURIComponent(`>=${since}`)}&per_page=${REST_RUNS_PER_PAGE}`,
    ),
    rest<RestRunsPayload>(
      "GET",
      `${wfPath}?event=merge_group&status=completed&created=${encodeURIComponent(`>=${since}`)}&per_page=${REST_RUNS_PER_PAGE}`,
    ),
  ]);
  if (
    !Array.isArray(defaultPayload?.workflow_runs) ||
    !Array.isArray(queuePayload?.workflow_runs)
  ) {
    return { unread: "malformed workflow runs response" };
  }
  const defaultCandidates = selectDefaultBranchRestRuns(
    defaultPayload.workflow_runs,
    branch,
    windowStartMs,
  );
  const queueCandidates = selectOtherQueueRestRuns(queuePayload.workflow_runs, {
    prNumber: input.prNumber,
    currentRunId: input.currentRunId,
    currentCommitOid: input.currentCommitOid,
    windowStartMs,
  });
  const toRun = async (
    candidate: RestRunCandidate,
    source: "default-branch" | "merge-queue",
  ): Promise<ElsewhereRun> => ({
    source,
    ...(candidate.branch !== undefined && { branch: candidate.branch }),
    ...(candidate.pr !== undefined && { pr: candidate.pr }),
    headSha: candidate.headSha.slice(0, 7),
    runId: candidate.runId,
    conclusion: candidate.conclusion,
    completedAt: candidate.completedAt,
    failedJobs: await hydrateRestFailedJobs(repo, candidate),
  });
  const defaultRuns = await mapPool(defaultCandidates, 3, (c) => toRun(c, "default-branch"));
  const queueRuns = await mapPool(queueCandidates, 3, (c) => toRun(c, "merge-queue"));
  return { runs: [...defaultRuns, ...queueRuns], since };
}
