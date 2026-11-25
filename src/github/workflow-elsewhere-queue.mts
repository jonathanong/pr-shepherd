import type { ElsewhereRun } from "../types/workflow-elsewhere.mts";
import type {
  RawQueueCommitsResponse,
  RestRunCandidate,
  RestWorkflowRunItem,
} from "../types/workflow-elsewhere-raw.mts";
import { dropNullNodes } from "./null-nodes.mts";
import {
  MAX_ELSEWHERE_RUNS_PER_SOURCE,
  NON_DEFAULT_BRANCH_EVENTS,
  mapFailedJobs,
  sortNewestFirst,
  stripNullAnnotations,
} from "./workflow-elsewhere-parse.mts";

const QUEUE_BRANCH_PR_RE = /^gh-readonly-queue\/.+\/pr-(\d+)-[0-9a-f]+$/i;

/** Parse the PR number from GitHub's merge-queue head branch `gh-readonly-queue/<base>/pr-<N>-<sha>`. */
function parseQueueHeadBranchPr(headBranch: string | null | undefined): number | undefined {
  if (!headBranch) return undefined;
  const match = QUEUE_BRANCH_PR_RE.exec(headBranch);
  if (!match) return undefined;
  const num = Number.parseInt(match[1]!, 10);
  return Number.isSafeInteger(num) && num > 0 ? num : undefined;
}

function validRunAttempt(attempt: number | null | undefined): number | undefined {
  return typeof attempt === "number" && Number.isSafeInteger(attempt) && attempt > 0
    ? attempt
    : undefined;
}

/** Filter and cap REST `merge_group` workflow runs to up to 3 completed entries from other PRs. */
export function selectOtherQueueRestRuns(
  runs: readonly RestWorkflowRunItem[],
  opts: { prNumber: number; currentRunId: string; currentCommitOid: string; windowStartMs: number },
): RestRunCandidate[] {
  const candidates: RestRunCandidate[] = [];
  for (const run of runs) {
    if (run.status !== "completed" || !run.conclusion) continue;
    const runId = String(run.id);
    if (runId === opts.currentRunId || run.head_sha === opts.currentCommitOid) continue;
    const pr = parseQueueHeadBranchPr(run.head_branch);
    if (pr === opts.prNumber) continue;
    const completedAt = run.updated_at ?? run.created_at;
    const completedMs = Date.parse(completedAt);
    if (!Number.isFinite(completedMs) || completedMs < opts.windowStartMs) continue;
    const runAttempt = validRunAttempt(run.run_attempt);
    candidates.push({
      runId,
      headSha: run.head_sha,
      ...(pr !== undefined && { pr }),
      ...(runAttempt !== undefined && { runAttempt }),
      conclusion: run.conclusion.toUpperCase(),
      completedAt,
    });
  }
  return sortNewestFirst(candidates).slice(0, MAX_ELSEWHERE_RUNS_PER_SOURCE);
}

/** Filter and cap REST default-branch workflow runs to up to 3 completed entries in the window. */
export function selectDefaultBranchRestRuns(
  runs: readonly RestWorkflowRunItem[],
  branch: string,
  windowStartMs: number,
): RestRunCandidate[] {
  const candidates: RestRunCandidate[] = [];
  for (const run of runs) {
    if (run.status !== "completed" || !run.conclusion) continue;
    if (run.event && NON_DEFAULT_BRANCH_EVENTS.has(run.event)) continue;
    const completedAt = run.updated_at ?? run.created_at;
    const completedMs = Date.parse(completedAt);
    if (!Number.isFinite(completedMs) || completedMs < windowStartMs) continue;
    const runAttempt = validRunAttempt(run.run_attempt);
    candidates.push({
      runId: String(run.id),
      headSha: run.head_sha,
      branch,
      ...(runAttempt !== undefined && { runAttempt }),
      conclusion: run.conclusion.toUpperCase(),
      completedAt,
    });
  }
  return sortNewestFirst(candidates).slice(0, MAX_ELSEWHERE_RUNS_PER_SOURCE);
}

/** Build one aliased GraphQL query fetching failed check runs and annotations for queue commits. */
export function buildQueueCommitsQuery(
  owner: string,
  repo: string,
  oids: readonly string[],
): { query: string; variables: Record<string, string> } {
  const decls = oids.map((_, i) => `, $oid${i}: String!`).join("");
  const fields = oids
    .map(
      (_, i) =>
        `c${i}: object(expression: $oid${i}) { ... on Commit { oid checkSuites(first: 20) { pageInfo { hasNextPage } nodes { workflowRun { databaseId } checkRuns(first: 15, filterBy: { conclusions: [FAILURE, TIMED_OUT] }) { nodes { name conclusion annotations(first: 3) { nodes { path location { start { line } } message } } } } } } } }`,
    )
    .join(" ");
  const query = `query QueueCommitCheckSuites($owner: String!, $repo: String!${decls}) { _shepherdRateLimit: rateLimit { cost limit nodeCount remaining resetAt used } repository(owner: $owner, name: $repo) { ${fields} } }`;
  const variables: Record<string, string> = { owner, repo };
  oids.forEach((oid, i) => {
    variables[`oid${i}`] = oid;
  });
  return { query, variables };
}

/** Combine REST queue-run candidates with GraphQL commit check suites; missing suites mark unavailable. */
export function mergeQueueCommitDetails(
  candidates: readonly RestRunCandidate[],
  oidToAlias: ReadonlyMap<string, string>,
  data: RawQueueCommitsResponse | undefined,
): { runs: ElsewhereRun[]; incomplete: boolean; unavailable?: string } {
  if (data) {
    const unread = dropNullNodes(data);
    let nullAnnotations = false;
    for (const commit of Object.values(data.repository ?? {})) {
      if (stripNullAnnotations(commit?.checkSuites?.nodes)) nullAnnotations = true;
    }
    if (unread || nullAnnotations) return { runs: [], incomplete: true };
  }
  const runs: ElsewhereRun[] = [];
  for (const candidate of candidates) {
    let failedJobs = [] as ElsewhereRun["failedJobs"];
    if (candidate.conclusion !== "SUCCESS") {
      const alias = oidToAlias.get(candidate.headSha);
      const commit = alias ? data?.repository?.[alias] : undefined;
      const suite = (commit?.checkSuites?.nodes ?? []).find(
        (s) =>
          s?.workflowRun?.databaseId != null &&
          String(s.workflowRun.databaseId) === candidate.runId,
      );
      if (!suite) {
        return {
          runs: [],
          incomplete: false,
          unavailable: "merge-queue commit check suite unavailable",
        };
      }
      failedJobs = mapFailedJobs(suite);
    }
    runs.push({
      source: "merge-queue",
      ...(candidate.pr !== undefined && { pr: candidate.pr }),
      headSha: candidate.headSha.slice(0, 7),
      runId: candidate.runId,
      conclusion: candidate.conclusion,
      completedAt: candidate.completedAt,
      failedJobs,
    });
  }
  return { runs, incomplete: false };
}
