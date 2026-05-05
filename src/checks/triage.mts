import { rest } from "../github/http.mts";
import type { CheckRun, ClassifiedCheck, TriagedCheck } from "../types.mts";
import type { RepoInfo } from "../github/client.mts";

const STARTUP_FAILURE_STATUS = "startup_failure";

export function triageFailingChecks(
  failingChecks: ClassifiedCheck[],
  repo: RepoInfo,
): Promise<TriagedCheck[]> {
  const jobsCache = new Map<string, Promise<JobsResponse["jobs"] | undefined>>();
  return Promise.all(failingChecks.map((c) => triageCheck(c, repo, jobsCache)));
}

async function triageCheck(
  check: ClassifiedCheck,
  repo: RepoInfo,
  jobsCache: Map<string, Promise<JobsResponse["jobs"] | undefined>>,
): Promise<TriagedCheck> {
  if (
    check.runId === null ||
    check.conclusion === "CANCELLED" ||
    check.conclusion === "STARTUP_FAILURE"
  ) {
    return { ...check };
  }
  const jobs = await fetchJobs(check.runId, repo, jobsCache);
  const jobInfo = jobs ? pickJobInfo(jobs, check.name) : undefined;
  return {
    ...check,
    ...(jobInfo?.workflowName !== undefined && { workflowName: jobInfo.workflowName }),
    ...(jobInfo?.jobName !== undefined && { jobName: jobInfo.jobName }),
    ...(jobInfo?.failedStep !== undefined && { failedStep: jobInfo.failedStep }),
  };
}

export async function fetchStartupFailureChecks(
  repo: RepoInfo,
  headSha: string,
): Promise<CheckRun[]> {
  const { owner, name } = repo;
  const perPage = 100;
  const MAX_RUN_PAGES = 10;
  const checks: CheckRun[] = [];
  for (let page = 1; page <= MAX_RUN_PAGES; page++) {
    const data = await rest<WorkflowRunsResponse>(
      "GET",
      `/repos/${owner}/${name}/actions/runs?head_sha=${encodeURIComponent(headSha)}&status=${STARTUP_FAILURE_STATUS}&per_page=${perPage}&page=${page}`,
    );
    checks.push(...data.workflow_runs.map(workflowRunToCheckRun));
    if (data.workflow_runs.length < perPage) break;
    if (page === MAX_RUN_PAGES) {
      process.stderr.write(
        `pr-shepherd: startup-failure run pagination cap (${MAX_RUN_PAGES * perPage} runs) reached for ${headSha} — startup-failure detection may be incomplete\n`,
      );
    }
  }
  return checks;
}

interface JobsResponse {
  jobs: Array<{
    name: string;
    workflow_name?: string;
    conclusion: string | null;
    steps?: Array<{ name: string; number: number; conclusion: string | null }>;
  }>;
}

interface WorkflowRunsResponse {
  workflow_runs: Array<{
    id: number;
    name: string | null;
    event: string | null;
    status: string | null;
    conclusion: string | null;
    html_url: string;
    display_title?: string | null;
  }>;
}

interface JobInfo {
  workflowName?: string;
  jobName?: string;
  failedStep?: string;
}

function workflowRunToCheckRun(run: WorkflowRunsResponse["workflow_runs"][number]): CheckRun {
  const summary = run.display_title?.trim() || undefined;
  return {
    name: run.name?.trim() || `workflow run ${run.id}`,
    status: "COMPLETED",
    conclusion: "STARTUP_FAILURE",
    detailsUrl: run.html_url,
    event: run.event,
    runId: String(run.id),
    ...(summary !== undefined && { summary }),
  };
}

function fetchJobs(
  runId: string,
  repo: RepoInfo,
  cache: Map<string, Promise<JobsResponse["jobs"] | undefined>>,
): Promise<JobsResponse["jobs"] | undefined> {
  const cached = cache.get(runId);
  if (cached) return cached;
  const promise = fetchJobsUncached(runId, repo);
  cache.set(runId, promise);
  return promise;
}

async function fetchJobsUncached(
  runId: string,
  repo: RepoInfo,
): Promise<JobsResponse["jobs"] | undefined> {
  const { owner, name } = repo;
  const perPage = 100;
  const MAX_JOB_PAGES = 20; // 2000 jobs max
  let pagesFetched = 0;
  const allJobs: JobsResponse["jobs"] = [];
  try {
    for (let page = 1; ; page++) {
      if (++pagesFetched > MAX_JOB_PAGES) {
        process.stderr.write(
          `pr-shepherd: job pagination cap (${MAX_JOB_PAGES * 100} jobs) reached for run ${runId} — triage may be incomplete\n`,
        );
        break;
      }
      const data = await rest<JobsResponse>(
        "GET",
        `/repos/${owner}/${name}/actions/runs/${runId}/jobs?filter=latest&per_page=${perPage}&page=${page}`,
      );
      allJobs.push(...data.jobs);
      if (data.jobs.length < perPage) break;
    }
  } catch {
    return undefined;
  }
  return allJobs;
}

function pickJobInfo(jobs: JobsResponse["jobs"], checkName: string): JobInfo | undefined {
  const exactMatches = jobs.filter((j) => j.name === checkName);
  const matchedJobs =
    exactMatches.length > 0 ? exactMatches : jobs.filter((j) => j.name.startsWith(checkName));
  const job =
    matchedJobs.find((j) => j.conclusion === "failure") ??
    matchedJobs.find((j) => j.conclusion !== null && j.conclusion !== "success") ??
    matchedJobs[0];
  if (!job) return undefined;
  const failedStep = job.steps?.find(
    (s) =>
      s.conclusion !== null &&
      s.conclusion !== "success" &&
      s.conclusion !== "skipped" &&
      s.conclusion !== "neutral",
  )?.name;
  return {
    workflowName: job.workflow_name,
    jobName: job.name,
    failedStep,
  };
}
