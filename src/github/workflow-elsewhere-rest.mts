import type { RepoInfo } from "./client.mts";
import { rest } from "./http.mts";
import { mapPool } from "../util/pool.mts";
import type {
  ElsewhereAnnotation,
  ElsewhereFailedJob,
  ElsewhereRun,
  ElsewhereScope,
} from "../types/workflow-elsewhere.mts";
import {
  MAX_ELSEWHERE_ANNOTATIONS,
  MAX_ELSEWHERE_FAILED_JOBS,
  MAX_ELSEWHERE_RUNS_PER_SOURCE,
  normalizeAnnotationMessage,
  sortNewestFirst,
} from "./workflow-elsewhere-parse.mts";
import {
  selectDefaultBranchRestRuns,
  selectOtherQueueRestRuns,
} from "./workflow-elsewhere-queue.mts";
import { fetchRestWorkflowRunsPaged } from "./workflow-elsewhere-rest-runs.mts";
import type { RestRunCandidate } from "../types/workflow-elsewhere-raw.mts";
import type {
  ReadWorkflowElsewhereInput,
  WorkflowElsewhereReadResult,
} from "./workflow-elsewhere-read.mts";

const REST_JOBS_PER_PAGE = 100;
const MAX_JOB_PAGES = 3;

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
): Promise<{ jobs: ElsewhereFailedJob[] } | { unread: string }> {
  if (candidate.conclusion === "SUCCESS") return { jobs: [] };
  const failed: Array<{ id: number; name: string; conclusion: string }> = [];
  const jobsBase = candidate.runAttempt
    ? `${repoPrefix(repo)}/actions/runs/${encodeURIComponent(candidate.runId)}/attempts/${candidate.runAttempt}/jobs?per_page=${REST_JOBS_PER_PAGE}`
    : `${repoPrefix(repo)}/actions/runs/${encodeURIComponent(candidate.runId)}/jobs?filter=latest&per_page=${REST_JOBS_PER_PAGE}`;
  for (let page = 1; page <= MAX_JOB_PAGES; page++) {
    // eslint-disable-next-line no-await-in-loop
    const jobsPayload = await rest<RestJobsPayload>("GET", `${jobsBase}&page=${page}`);
    if (!Array.isArray(jobsPayload?.jobs)) return { unread: "malformed workflow jobs response" };
    for (const job of jobsPayload.jobs) {
      const c = job.conclusion?.toUpperCase();
      if (c === "FAILURE" || c === "TIMED_OUT") {
        failed.push({ id: job.id, name: job.name, conclusion: c });
        if (failed.length >= MAX_ELSEWHERE_FAILED_JOBS) break;
      }
    }
    if (failed.length >= MAX_ELSEWHERE_FAILED_JOBS || jobsPayload.jobs.length < REST_JOBS_PER_PAGE)
      break;
    if (page === MAX_JOB_PAGES) return { unread: "workflow jobs pagination truncated" };
  }
  const hydrated = await mapPool(
    failed,
    4,
    async (job): Promise<ElsewhereFailedJob | { unread: string }> => {
      const rawAnnotations = await rest<unknown>(
        "GET",
        `${repoPrefix(repo)}/check-runs/${job.id}/annotations?per_page=100`,
      );
      if (!Array.isArray(rawAnnotations)) {
        return { unread: "malformed check-run annotations response" };
      }
      const annotations: ElsewhereAnnotation[] = (rawAnnotations as RestAnnotationItem[])
        .slice(0, MAX_ELSEWHERE_ANNOTATIONS)
        .map((ann) => ({
          path: (ann.path ?? "").trim(),
          line: typeof ann.start_line === "number" && ann.start_line > 0 ? ann.start_line : null,
          message: normalizeAnnotationMessage(ann.message),
        }));
      const moreAnnotations =
        rawAnnotations.length > MAX_ELSEWHERE_ANNOTATIONS
          ? rawAnnotations.length - MAX_ELSEWHERE_ANNOTATIONS
          : undefined;
      return {
        name: job.name,
        conclusion: job.conclusion,
        annotations,
        ...(moreAnnotations !== undefined && { moreAnnotations }),
      };
    },
  );
  const bad = hydrated.find((item): item is { unread: string } => "unread" in item);
  return bad ? bad : { jobs: hydrated as ElsewhereFailedJob[] };
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
  const [defaultRead, queueRead] = await Promise.all([
    fetchRestWorkflowRunsPaged(
      `${wfPath}?branch=${encodeURIComponent(branch)}&status=completed`,
      windowStartMs,
      (items) => selectDefaultBranchRestRuns(items, branch, windowStartMs),
      MAX_ELSEWHERE_RUNS_PER_SOURCE,
    ),
    fetchRestWorkflowRunsPaged(
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
    ),
  ]);
  if ("unread" in defaultRead) return defaultRead;
  if ("unread" in queueRead) return queueRead;
  const toRun = async (
    candidate: RestRunCandidate,
    source: "default-branch" | "merge-queue",
  ): Promise<ElsewhereRun | { unread: string }> => {
    const jobsRes = await hydrateRestFailedJobs(repo, candidate);
    if ("unread" in jobsRes) return jobsRes;
    return {
      source,
      ...(candidate.branch !== undefined && { branch: candidate.branch }),
      ...(candidate.pr !== undefined && { pr: candidate.pr }),
      headSha: candidate.headSha.slice(0, 7),
      runId: candidate.runId,
      conclusion: candidate.conclusion,
      completedAt: candidate.completedAt,
      failedJobs: jobsRes.jobs,
    };
  };
  const results = [
    ...(await mapPool(defaultRead.candidates, 3, (c) => toRun(c, "default-branch"))),
    ...(await mapPool(queueRead.candidates, 3, (c) => toRun(c, "merge-queue"))),
  ];
  const bad = results.find((item): item is { unread: string } => "unread" in item);
  if (bad) return bad;
  const workflowName = defaultRead.workflowName ?? queueRead.workflowName ?? input.workflowName;
  const workflowPath = defaultRead.workflowPath ?? queueRead.workflowPath ?? input.workflowPath;
  const scope: ElsewhereScope = {
    ...(workflowName !== undefined && { workflowName }),
    ...(workflowPath !== undefined && { workflowPath }),
    since,
    defaultBranch: {
      branch,
      runsRead: defaultRead.runsRead,
      matched: defaultRead.matched,
      shown: defaultRead.candidates.length,
    },
    mergeQueue: {
      runsRead: queueRead.runsRead,
      matched: queueRead.matched,
      shown: queueRead.candidates.length,
    },
  };
  return { runs: sortNewestFirst(results as ElsewhereRun[]), scope };
}
