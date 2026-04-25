/**
 * Triage failing check runs: call the jobs API once per runId to fetch
 * workflow name, job name, and the first failed step name. Then fetch the
 * last N lines of the failing job's log so the agent can diagnose failures
 * without a separate tool call.
 *
 * No heuristic classification is applied — the raw GitHub `conclusion` field
 * is preserved as-is. The agent decides whether a failure is transient or
 * real based on the log tail and other context.
 *
 * For checks with runId === null (external StatusContexts) no API calls are
 * made; workflowName, jobName, failedStep, and logTail are all absent.
 *
 * Jobs responses are cached by runId so checks that share a run (e.g. matrix
 * builds or multiple required steps in one workflow) make only one API call.
 * Log tails are fetched per job ID, not per runId.
 */

import { rest, restText } from "../github/http.mts";
import type { ClassifiedCheck, TriagedCheck } from "../types.mts";
import type { RepoInfo } from "../github/client.mts";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Triage each failing check: call the jobs API for each check with a non-null
 * runId to fetch workflow name, job name, and the first failed step name, then
 * fetch the last `logTailLines` lines of the failing job's log.
 */
export function triageFailingChecks(
  failingChecks: ClassifiedCheck[],
  repo: RepoInfo,
  logTailLines: number,
): Promise<TriagedCheck[]> {
  const jobsCache = new Map<string, Promise<JobsResponse["jobs"] | undefined>>();
  return Promise.all(failingChecks.map((c) => triageCheck(c, repo, jobsCache, logTailLines)));
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function triageCheck(
  check: ClassifiedCheck,
  repo: RepoInfo,
  jobsCache: Map<string, Promise<JobsResponse["jobs"] | undefined>>,
  logTailLines: number,
): Promise<TriagedCheck> {
  if (check.runId === null) {
    return { ...check };
  }
  const jobs = await fetchJobs(check.runId, repo, jobsCache);
  const jobInfo = jobs ? pickJobInfo(jobs, check.name) : undefined;
  const logTail =
    jobInfo?.jobId !== undefined && logTailLines > 0
      ? await fetchLogTail(jobInfo.jobId, repo, logTailLines)
      : undefined;
  return {
    ...check,
    ...(jobInfo?.workflowName !== undefined && { workflowName: jobInfo.workflowName }),
    ...(jobInfo?.jobName !== undefined && { jobName: jobInfo.jobName }),
    ...(jobInfo?.failedStep !== undefined && { failedStep: jobInfo.failedStep }),
    ...(logTail !== undefined && { logTail }),
  };
}

interface JobsResponse {
  jobs: Array<{
    id: number;
    name: string;
    workflow_name?: string;
    conclusion: string | null;
    steps?: Array<{ name: string; number: number; conclusion: string | null }>;
  }>;
}

interface JobInfo {
  workflowName?: string;
  jobName?: string;
  failedStep?: string;
  jobId?: number;
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
  // Match by name. For matrix jobs sharing a check name, prefer a failing one.
  // Fall back to prefix matching for matrix jobs whose workflow-API name includes
  // a suffix like "(ubuntu)" while checkName is just the base name.
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
    jobId: job.id,
  };
}

async function fetchLogTail(
  jobId: number,
  repo: RepoInfo,
  logTailLines: number,
): Promise<string | undefined> {
  if (logTailLines <= 0) return undefined;
  const { owner, name } = repo;
  try {
    const text = await restText(`/repos/${owner}/${name}/actions/jobs/${jobId}/logs`);
    const lines = text.split("\n");
    if (lines.length <= logTailLines) return text;
    return lines.slice(-logTailLines).join("\n");
  } catch {
    return undefined;
  }
}
