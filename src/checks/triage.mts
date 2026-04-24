/**
 * Triage failing check runs into three categories based solely on GitHub's
 * own conclusion field — no log-content classification:
 *   - timeout: conclusion is TIMED_OUT.
 *   - cancelled: conclusion is CANCELLED, STARTUP_FAILURE, or STALE.
 *   - actionable: everything else (FAILURE, ACTION_REQUIRED, …).
 *
 * Exception: checks with runId === null are always classified as "actionable"
 * regardless of conclusion, so they surface in fix_code where the monitor
 * escalates to the user (no run to rerun/inspect).
 *
 * For all checks with a non-null runId, the jobs API is called once per runId
 * (results are cached across checks that share a run) to fetch workflow name
 * and, for actionable checks, the first failed step name. No log fetching is done.
 *
 * Note on infrastructure-killed FAILURE runs: GitHub reports these as
 * conclusion === "FAILURE", so they classify as "actionable". The jobs API
 * surfaces their failedStep (e.g. "Set up job") which gives the agent a
 * GitHub-native signal to distinguish runner setup deaths from real test
 * failures — without any log-pattern analysis at the CLI level.
 */

import { rest } from "../github/http.mts";
import type { ClassifiedCheck, TriagedCheck, FailureKind, CheckConclusion } from "../types.mts";
import type { RepoInfo } from "../github/client.mts";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Triage each failing check: classify by GitHub conclusion and call the jobs
 * API for each check with a non-null runId to fetch workflow name and (for
 * actionable failures) the name of the first failed step.
 *
 * Jobs responses are cached by runId so checks that share a run (e.g. matrix
 * builds or multiple required steps in one workflow) make only one API call.
 */
export function triageFailingChecks(
  failingChecks: ClassifiedCheck[],
  repo: RepoInfo,
): Promise<TriagedCheck[]> {
  const jobsCache = new Map<string, Promise<JobsResponse["jobs"] | undefined>>();
  return Promise.all(failingChecks.map((c) => triageCheck(c, repo, jobsCache)));
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function triageCheck(
  check: ClassifiedCheck,
  repo: RepoInfo,
  jobsCache: Map<string, Promise<JobsResponse["jobs"] | undefined>>,
): Promise<TriagedCheck> {
  const failureKind = check.runId === null ? "actionable" : classifyConclusion(check.conclusion);
  if (check.runId === null) {
    return { ...check, failureKind };
  }
  const jobs = await fetchJobs(check.runId, repo, jobsCache);
  const jobInfo = jobs ? pickJobInfo(jobs, check.name, failureKind) : undefined;
  return {
    ...check,
    failureKind,
    workflowName: jobInfo?.workflowName,
    ...(failureKind === "actionable" && { failedStep: jobInfo?.failedStep }),
  };
}

function classifyConclusion(c: CheckConclusion): FailureKind {
  if (c === "TIMED_OUT") return "timeout";
  if (c === "CANCELLED" || c === "STARTUP_FAILURE" || c === "STALE") return "cancelled";
  return "actionable";
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
  failedStep?: string;
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

function pickJobInfo(
  jobs: JobsResponse["jobs"],
  checkName: string,
  failureKind: FailureKind,
): JobInfo | undefined {
  // Match by name. For matrix jobs sharing a check name, prefer a failing one.
  // Fall back to prefix matching for matrix jobs whose workflow-API name includes
  // a suffix like "(ubuntu)" while checkName is just the base name.
  const exactMatches = jobs.filter((j) => j.name === checkName);
  const matchedJobs =
    exactMatches.length > 0 ? exactMatches : jobs.filter((j) => j.name.startsWith(checkName));
  const job = matchedJobs.find((j) => j.conclusion === "failure") ?? matchedJobs[0];
  if (!job) return undefined;
  const failedStep =
    failureKind === "actionable"
      ? job.steps?.find((s) => s.conclusion === "failure")?.name
      : undefined;
  return { workflowName: job.workflow_name, failedStep };
}
