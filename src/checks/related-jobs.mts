import type { RepoInfo } from "../github/client.mts";
import type { StateKey } from "../state/rest-cache.mts";
import type { RelatedFailedJob } from "../types/check-classification.mts";
import { fetchJobLogExcerpt } from "./job-log.mts";
import { pickFailedStep, type ActionsJob } from "./jobs-types.mts";
import type { TriageBudget } from "./triage-budget.mts";

/** Max sibling failed jobs reported (and log-fetched) per workflow run. */
const MAX_RELATED_JOBS = 5;

const FAILED_JOB_CONCLUSIONS = new Set(["failure", "timed_out"]);

/**
 * Other failed jobs in the same workflow run, excluding the matched job and any
 * job already surfaced as its own failing check (`surfacedNames`).
 */
export function pickRelatedFailedJobs(
  jobs: ActionsJob[],
  matchedJobId: number | undefined,
  surfacedNames: ReadonlySet<string>,
): ActionsJob[] {
  return jobs
    .filter(
      (j) =>
        j.conclusion !== null &&
        FAILED_JOB_CONCLUSIONS.has(j.conclusion) &&
        (j.id === undefined || j.id !== matchedJobId) &&
        !surfacedNames.has(j.name),
    )
    .slice(0, MAX_RELATED_JOBS);
}

export async function fetchRelatedJobs(
  jobs: ActionsJob[],
  repo: RepoInfo,
  stateKey?: StateKey,
  budget?: TriageBudget,
): Promise<RelatedFailedJob[]> {
  const logs = await Promise.all(
    jobs.map((job) =>
      job.id === undefined
        ? undefined
        : fetchJobLogExcerpt(job.id, repo, stateKey, job.conclusion !== null, budget),
    ),
  );
  return jobs.map((job, i) => {
    const failedStep = pickFailedStep(job);
    const logExcerpt = logs[i];
    return {
      name: job.name,
      conclusion: (job.conclusion ?? "").toUpperCase(),
      ...(failedStep !== undefined && { failedStep }),
      ...(logExcerpt !== undefined && { logExcerpt }),
    };
  });
}
