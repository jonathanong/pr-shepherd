/* eslint-disable max-lines */
import { restWithRateLimit, restText } from "../github/http.mts";
import type { CheckRun, ClassifiedCheck, TriagedCheck } from "../types.mts";
import type { RepoInfo } from "../github/client.mts";
import { loadDerived, storeDerived, type StateKey } from "../state/rest-cache.mts";
import { buildLogExcerpt } from "./log-excerpt.mts";
import { TriageBudget } from "./triage-budget.mts";
import { mapPool } from "../util/pool.mts";

const STARTUP_FAILURE_STATUS = "startup_failure";

export async function triageFailingChecks(
  failingChecks: ClassifiedCheck[],
  repo: RepoInfo,
  stateKey?: StateKey,
  budget = new TriageBudget(),
): Promise<TriagedCheck[]> {
  const jobsCache = new Map<string, Promise<JobsResponse["jobs"] | undefined>>();
  const checks = await mapPool(failingChecks, 4, (check) =>
    triageCheck(check, repo, jobsCache, stateKey, budget),
  );
  budget.throwIfSecondary();
  budget.reportOmissionIfNeeded();
  return checks;
}

async function triageCheck(
  check: ClassifiedCheck,
  repo: RepoInfo,
  jobsCache: Map<string, Promise<JobsResponse["jobs"] | undefined>>,
  stateKey?: StateKey,
  budget?: TriageBudget,
): Promise<TriagedCheck> {
  if (check.runId === null || check.conclusion === "STARTUP_FAILURE") {
    return { ...check };
  }
  if (!jobsCache.has(check.runId) && !budget?.canScheduleOptional()) {
    return { ...check };
  }
  const jobs = await fetchJobs(check.runId, repo, jobsCache, stateKey, budget);
  const jobInfo = jobs ? pickJobInfo(jobs, check.name) : undefined;
  const runAttempt = jobs ? pickRunAttempt(jobs) : undefined;
  const logExcerpt =
    check.conclusion !== "CANCELLED" && jobInfo?.jobId
      ? await fetchJobLogExcerpt(
          jobInfo.jobId,
          repo,
          stateKey,
          jobInfo.jobConclusion != null,
          budget,
        )
      : undefined;
  return {
    ...check,
    ...(runAttempt !== undefined && { runAttempt }),
    ...(jobInfo?.workflowName !== undefined && { workflowName: jobInfo.workflowName }),
    ...(jobInfo?.jobName !== undefined && { jobName: jobInfo.jobName }),
    ...(jobInfo?.failedStep !== undefined && { failedStep: jobInfo.failedStep }),
    ...(logExcerpt !== undefined && { logExcerpt }),
  };
}

export async function fetchStartupFailureChecks(
  repo: RepoInfo,
  headSha: string,
  prNumber: number,
  stateKey?: StateKey,
  budget = new TriageBudget(),
): Promise<CheckRun[]> {
  try {
    return await fetchStartupFailureChecksUncached(repo, headSha, prNumber, stateKey, budget);
  } catch (err) {
    budget.observeError(err);
    budget.throwIfSecondary();
    if (budget.primaryExhausted) return [];
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `pr-shepherd: startup-failure run fetch failed for PR #${prNumber} at ${headSha} (ignored): ${msg}\n`,
    );
    return [];
  }
}

async function fetchStartupFailureChecksUncached(
  repo: RepoInfo,
  headSha: string,
  prNumber: number,
  stateKey?: StateKey,
  budget?: TriageBudget,
): Promise<CheckRun[]> {
  const { owner, name } = repo;
  const perPage = 100;
  const MAX_RUN_PAGES = 10;
  const checks: CheckRun[] = [];
  for (let page = 1; page <= MAX_RUN_PAGES; page++) {
    if (!budget?.canScheduleOptional()) break;
    let result: Awaited<ReturnType<typeof restWithRateLimit<WorkflowRunsResponse>>>;
    try {
      result = await restWithRateLimit<WorkflowRunsResponse>(
        "GET",
        `/repos/${owner}/${name}/actions/runs?head_sha=${encodeURIComponent(headSha)}&status=${STARTUP_FAILURE_STATUS}&per_page=${perPage}&page=${page}`,
        undefined,
        stateKey
          ? {
              conditional: {
                key: stateKey,
                name: `runs-startupfailure-${headSha}-p${page}`,
                headSha,
              },
            }
          : undefined,
      );
    } catch (error) {
      budget?.observeError(error);
      if (budget?.primaryExhausted) break;
      throw error;
    }
    const { data, rateLimit } = result;
    budget?.observe(rateLimit);
    checks.push(
      ...data.workflow_runs
        .filter((run) => runBelongsToPr(run, prNumber, headSha))
        .map(workflowRunToCheckRun),
    );
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
    id?: number;
    name: string;
    workflow_name?: string;
    conclusion: string | null;
    run_attempt?: number;
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
    run_attempt?: number;
    pull_requests?: Array<{
      number?: number | null;
      head?: { sha?: string | null } | null;
    }>;
  }>;
}

interface JobInfo {
  jobId?: number;
  workflowName?: string;
  jobName?: string;
  failedStep?: string;
  /** The matched job's raw conclusion — null while still running. Gates log-excerpt caching. */
  jobConclusion: string | null;
}

function workflowRunToCheckRun(run: WorkflowRunsResponse["workflow_runs"][number]): CheckRun {
  const summary = run.display_title?.trim() || undefined;
  const runAttempt = normalizeRunAttempt(run.run_attempt);
  return {
    name: run.name?.trim() || `workflow run ${run.id}`,
    status: "COMPLETED",
    conclusion: "STARTUP_FAILURE",
    source: "startup_failure",
    detailsUrl: run.html_url,
    event: run.event,
    runId: String(run.id),
    ...(runAttempt !== undefined && { runAttempt }),
    ...(summary !== undefined && { summary }),
  };
}

function normalizeRunAttempt(value: number | undefined): number | undefined {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value : undefined;
}

function pickRunAttempt(jobs: JobsResponse["jobs"]): number | undefined {
  for (const job of jobs) {
    const attempt = normalizeRunAttempt(job.run_attempt);
    if (attempt !== undefined) return attempt;
  }
  return undefined;
}

function runBelongsToPr(
  run: WorkflowRunsResponse["workflow_runs"][number],
  prNumber: number,
  headSha: string,
): boolean {
  return (run.pull_requests ?? []).some(
    (pr) => pr.number === prNumber && (pr.head?.sha ?? headSha) === headSha,
  );
}

function fetchJobs(
  runId: string,
  repo: RepoInfo,
  cache: Map<string, Promise<JobsResponse["jobs"] | undefined>>,
  stateKey?: StateKey,
  budget?: TriageBudget,
): Promise<JobsResponse["jobs"] | undefined> {
  const cached = cache.get(runId);
  if (cached) return cached;
  const promise = fetchJobsUncached(runId, repo, stateKey, budget);
  cache.set(runId, promise);
  return promise;
}

async function fetchJobsUncached(
  runId: string,
  repo: RepoInfo,
  stateKey?: StateKey,
  budget?: TriageBudget,
): Promise<JobsResponse["jobs"] | undefined> {
  const { owner, name } = repo;
  const perPage = 100;
  const MAX_JOB_PAGES = 20; // 2000 jobs max
  let pagesFetched = 0;
  const allJobs: JobsResponse["jobs"] = [];
  try {
    for (let page = 1; ; page++) {
      if (!budget?.canScheduleOptional()) break;
      if (++pagesFetched > MAX_JOB_PAGES) {
        process.stderr.write(
          `pr-shepherd: job pagination cap (${MAX_JOB_PAGES * 100} jobs) reached for run ${runId} — triage may be incomplete\n`,
        );
        break;
      }
      const { data, rateLimit } = await restWithRateLimit<JobsResponse>(
        "GET",
        `/repos/${owner}/${name}/actions/runs/${runId}/jobs?filter=latest&per_page=${perPage}&page=${page}`,
        undefined,
        stateKey
          ? { conditional: { key: stateKey, name: `jobs-run-${runId}-p${page}` } }
          : undefined,
      );
      budget?.observe(rateLimit);
      allJobs.push(...data.jobs);
      if (data.jobs.length < perPage) break;
    }
  } catch (error) {
    budget?.observeError(error);
    return budget?.primaryExhausted ? allJobs : undefined;
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
    ...(job.id !== undefined && { jobId: job.id }),
    workflowName: job.workflow_name,
    jobName: job.name,
    failedStep,
    jobConclusion: job.conclusion,
  };
}

/**
 * `cacheable` gates the cross-tick cache — only set once the matched job has
 * a terminal conclusion, so an in-progress job's (possibly partial) log
 * never gets frozen into the cache.
 */
async function fetchJobLogExcerpt(
  jobId: number,
  repo: RepoInfo,
  stateKey?: StateKey,
  cacheable = false,
  budget?: TriageBudget,
): Promise<string | undefined> {
  const cacheName = `joblog-v2-${jobId}`;
  if (stateKey && cacheable) {
    const cached = await loadDerived<string | null>(stateKey, cacheName);
    if (cached) return cached.value ?? undefined;
  }
  const { owner, name } = repo;
  try {
    if (!budget?.canScheduleOptional()) return undefined;
    const excerpt = buildLogExcerpt(
      await restText(`/repos/${owner}/${name}/actions/jobs/${jobId}/logs`, (rateLimit) =>
        budget?.observe(rateLimit),
      ),
    );
    if (stateKey && cacheable) {
      await storeDerived<string | null>(stateKey, cacheName, excerpt ?? null);
    }
    return excerpt;
  } catch (error) {
    budget?.observeError(error);
    return undefined;
  }
}
