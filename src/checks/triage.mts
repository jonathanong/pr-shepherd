/* eslint-disable max-lines */
import { rest, restText } from "../github/http.mts";
import type { CheckRun, ClassifiedCheck, TriagedCheck } from "../types.mts";
import type { RepoInfo } from "../github/client.mts";

const STARTUP_FAILURE_STATUS = "startup_failure";
const LOG_EXCERPT_CONTEXT_LINES = 16;
const LOG_EXCERPT_TAIL_LINES = 28;
const LOG_EXCERPT_MAX_CHARS = 4_000;
const TRUNCATED_SUFFIX = "\n[truncated]";
const ANSI_SGR_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

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
  const logExcerpt = jobInfo?.jobId ? await fetchJobLogExcerpt(jobInfo.jobId, repo) : undefined;
  return {
    ...check,
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
): Promise<CheckRun[]> {
  try {
    return await fetchStartupFailureChecksUncached(repo, headSha, prNumber);
  } catch (err) {
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
}

function workflowRunToCheckRun(run: WorkflowRunsResponse["workflow_runs"][number]): CheckRun {
  const summary = run.display_title?.trim() || undefined;
  return {
    name: run.name?.trim() || `workflow run ${run.id}`,
    status: "COMPLETED",
    conclusion: "STARTUP_FAILURE",
    source: "startup_failure",
    detailsUrl: run.html_url,
    event: run.event,
    runId: String(run.id),
    ...(summary !== undefined && { summary }),
  };
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
    ...(job.id !== undefined && { jobId: job.id }),
    workflowName: job.workflow_name,
    jobName: job.name,
    failedStep,
  };
}

async function fetchJobLogExcerpt(jobId: number, repo: RepoInfo): Promise<string | undefined> {
  const { owner, name } = repo;
  try {
    return buildLogExcerpt(await restText(`/repos/${owner}/${name}/actions/jobs/${jobId}/logs`));
  } catch {
    return undefined;
  }
}

function buildLogExcerpt(raw: string): string | undefined {
  const lines = raw
    .split(/\r?\n/)
    .map(cleanLogLine)
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) return undefined;

  const aggregateExcerpt = buildAggregateJobResultsExcerpt(lines);
  if (aggregateExcerpt !== undefined) return aggregateExcerpt;

  const errorIndex = findLogExcerptAnchor(lines);
  if (errorIndex === -1) return truncateLogExcerpt(lines.slice(-LOG_EXCERPT_TAIL_LINES).join("\n"));
  const start = Math.max(0, errorIndex - LOG_EXCERPT_CONTEXT_LINES);
  const excerpt = lines.slice(
    start,
    Math.min(lines.length, errorIndex + LOG_EXCERPT_CONTEXT_LINES + 1),
  );
  return truncateAnchoredExcerpt(excerpt, errorIndex - start);
}

function findLogExcerptAnchor(lines: string[]): number {
  const explicitError = lines.findIndex((line) => line.includes("##[error]"));
  if (explicitError !== -1) return explicitError;
  return lines.findIndex((line) => /\b(error|failed|cancelled)\b/i.test(line));
}

function buildAggregateJobResultsExcerpt(lines: string[]): string | undefined {
  const jobResults = extractJobResults(lines);
  if (jobResults === undefined) return undefined;
  const failed = Object.entries(jobResults)
    .map(([name, value]) => ({ name, result: extractJobResult(value) }))
    .filter(
      (entry) => entry.result !== undefined && !["success", "skipped"].includes(entry.result),
    );
  if (failed.length === 0) return undefined;

  const output = [
    ...lines.filter((line) => /required jobs failed|exit code \d+/i.test(line)),
    "Job results (non-success):",
    ...failed.map((entry) => `${entry.name}: ${entry.result}`),
  ];
  return truncateLogExcerpt(output.join("\n"));
}

function extractJobResults(lines: string[]): Record<string, unknown> | undefined {
  const startIndex = lines.findIndex((line) => line.includes("Job results:"));
  if (startIndex === -1) return undefined;
  const block = collectJsonBlock(lines, startIndex);
  if (block === undefined) return undefined;
  try {
    const parsed = JSON.parse(block) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function collectJsonBlock(lines: string[], startIndex: number): string | undefined {
  const startLine = lines[startIndex] ?? "";
  const objectStart = startLine.indexOf("{");
  if (objectStart === -1) return undefined;
  const collected = [startLine.slice(objectStart)];
  let depth = braceDepth(collected[0]);
  for (let i = startIndex + 1; i < lines.length && depth > 0; i++) {
    const line = lines[i] ?? "";
    collected.push(line);
    depth += braceDepth(line);
  }
  return depth === 0 ? collected.join("\n") : undefined;
}

function braceDepth(line: string): number {
  return [...line].reduce((depth, ch) => {
    if (ch === "{") return depth + 1;
    if (ch === "}") return depth - 1;
    return depth;
  }, 0);
}

function extractJobResult(value: unknown): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result = (value as { result?: unknown }).result;
  return typeof result === "string" ? result : undefined;
}

function truncateLogExcerpt(text: string): string {
  if (text.length <= LOG_EXCERPT_MAX_CHARS) return text;
  return `${text.slice(0, LOG_EXCERPT_MAX_CHARS - TRUNCATED_SUFFIX.length).trimEnd()}${TRUNCATED_SUFFIX}`;
}

function truncateAnchoredExcerpt(lines: string[], anchorIndex: number): string {
  const text = lines.join("\n");
  if (text.length <= LOG_EXCERPT_MAX_CHARS) return text;
  return truncateLogExcerpt(`${TRUNCATED_SUFFIX.trim()}\n${lines.slice(anchorIndex).join("\n")}`);
}

function cleanLogLine(line: string): string {
  return line
    .replace(/^\uFEFF/, "")
    .replace(ANSI_SGR_RE, "")
    .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s*/, "")
    .replace(/##\[(?:group|endgroup)\]/g, "")
    .trimEnd();
}
