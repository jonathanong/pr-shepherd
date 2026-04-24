/**
 * Triage failing check runs into three categories based solely on GitHub's
 * own conclusion field — no log-content classification:
 *   - timeout: conclusion is TIMED_OUT.
 *   - cancelled: conclusion is CANCELLED, STARTUP_FAILURE, or STALE.
 *   - actionable: everything else (FAILURE, ACTION_REQUIRED, …).
 *
 * For actionable checks, the name of the first failed step in the matched job
 * is fetched from the GitHub Actions jobs API and returned as `failedStep`.
 * No log fetching is done for timeout/cancelled checks.
 */

import { rest } from "../github/http.mts";
import type { ClassifiedCheck, TriagedCheck, FailureKind, CheckConclusion } from "../types.mts";
import type { RepoInfo } from "../github/client.mts";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Triage each failing check: classify by GitHub conclusion and, for actionable
 * failures, fetch the name of the first failed step from the jobs API.
 */
export function triageFailingChecks(
  failingChecks: ClassifiedCheck[],
  repo: RepoInfo,
): Promise<TriagedCheck[]> {
  return Promise.all(failingChecks.map((c) => triageCheck(c, repo)));
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function triageCheck(check: ClassifiedCheck, repo: RepoInfo): Promise<TriagedCheck> {
  const failureKind = check.runId === null ? "actionable" : classifyConclusion(check.conclusion);
  if (check.runId === null) {
    return { ...check, failureKind };
  }
  const jobInfo = await fetchJobInfo(check.runId, check.name, repo);
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

async function fetchJobInfo(
  runId: string,
  checkName: string,
  repo: RepoInfo,
): Promise<JobInfo | undefined> {
  const { owner, name } = repo;
  const perPage = 100;
  const allJobs: JobsResponse["jobs"] = [];
  try {
    for (let page = 1; ; page++) {
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
  // Match by name. For matrix jobs sharing a check name, prefer a failing one.
  const matches = allJobs.filter((j) => j.name === checkName);
  const job = matches.find((j) => j.conclusion === "failure") ?? matches[0];
  const failedStep = job?.steps?.find((s) => s.conclusion === "failure");
  return {
    workflowName: job?.workflow_name,
    failedStep: failedStep?.name,
  };
}
