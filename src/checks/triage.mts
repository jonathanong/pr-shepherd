/**
 * Triage failing check runs into four categories:
 *   - timeout: conclusion is TIMED_OUT or logs contain timeout markers.
 *   - infrastructure: conclusion is CANCELLED + infra-error log patterns.
 *   - actionable: compile error, test failure, lint violation from the PR's changes.
 *   - flaky: pre-existing or timing-dependent failures in untouched files.
 *
 * Shepherd computes and returns triage results, including `failureKind`, for
 * downstream callers or slash-command logic to consume.
 */

import { rest, restText } from "../github/http.mts";
import type { ClassifiedCheck, TriagedCheck, FailureKind } from "../types.mts";
import type { RepoInfo } from "../github/client.mts";
import { loadConfig } from "../config/load.mts";

const config = loadConfig();
const TIMEOUT_PATTERNS = config.checks.timeoutPatterns.map((p) => new RegExp(p, "i"));
const INFRA_PATTERNS = config.checks.infraPatterns.map((p) => new RegExp(p, "i"));

// Matches GitHub Actions workflow-command error markers: `##[error]...`
// May be preceded by a timestamp: `2026-04-23T09:53:06.123Z ##[error]Error: foo`
const ERROR_MARKER_RE = /##\[error\]/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch logs and triage each failing check.
 *
 * Fetching logs is skipped for checks that have no `runId` (e.g. StatusContext nodes).
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
  if (check.runId === null) {
    return { ...check, failureKind: "actionable" };
  }

  const logExcerpt = await fetchFailedLogs(check.runId, repo);
  const failureKind = classifyLogs(check, logExcerpt);
  const errorExcerpt = extractErrorLines(logExcerpt, config.checks.errorLines) || undefined;

  return {
    ...check,
    failureKind,
    logExcerpt: logExcerpt.slice(-config.checks.logMaxChars) || undefined,
    errorExcerpt,
  };
}

interface JobsResponse {
  jobs: Array<{
    id: number;
    name: string;
    conclusion: string | null;
  }>;
}

async function fetchFailedLogs(runId: string, repo: RepoInfo): Promise<string> {
  try {
    const { owner, name } = repo;
    const perPage = 100;
    const allJobs: JobsResponse["jobs"] = [];

    for (let page = 1; ; page++) {
      const jobsData = await rest<JobsResponse>(
        "GET",
        `/repos/${owner}/${name}/actions/runs/${runId}/jobs?filter=latest&per_page=${perPage}&page=${page}`,
      );
      allJobs.push(...jobsData.jobs);
      if (jobsData.jobs.length < perPage) break;
    }

    const failedJobs = allJobs.filter((j) =>
      ["failure", "timed_out", "cancelled"].includes(j.conclusion ?? ""),
    );

    if (failedJobs.length === 0) return "";

    const logParts = await Promise.all(
      failedJobs.map(async (job) => {
        try {
          // Job-level endpoint (jobs/{id}/logs) redirects to plain text, unlike
          // run-level (runs/{id}/logs) which returns a ZIP archive.
          const logs = await restText(`/repos/${owner}/${name}/actions/jobs/${job.id}/logs`);
          return logs.trim() ? `===== job: ${job.name} =====\n${logs}` : "";
        } catch {
          return "";
        }
      }),
    );

    const combined = logParts.filter(Boolean).join("\n");
    const ansiEscapes = /\u001B\[[0-9;]*m/g;
    return combined
      .replace(ansiEscapes, "")
      .split("\n")
      .slice(-config.checks.logMaxLines)
      .join("\n");
  } catch {
    return "";
  }
}

/**
 * Extract the last `maxLines` `##[error]`-marked lines from GitHub Actions logs,
 * stripping the workflow-command prefix and any leading timestamp.
 *
 * Falls back to the last `maxLines` raw lines when no `##[error]` markers are found
 * (some checks don't emit workflow commands — e.g. external status checks).
 */
export function extractErrorLines(logs: string, maxLines: number): string {
  const lines = logs.split("\n");
  const errorLines = lines.filter((l) => ERROR_MARKER_RE.test(l));
  const source = errorLines.length > 0 ? errorLines : lines;
  const tail = source.slice(-maxLines);
  return tail
    .map((l) => {
      // Strip optional timestamp + `##[error]` prefix:
      // "2026-04-23T09:53:06.123Z ##[error]Error: foo" → "Error: foo"
      return l.replace(/^.*##\[error\]/, "").trim();
    })
    .filter(Boolean)
    .join("\n");
}

function classifyLogs(check: ClassifiedCheck, logs: string): FailureKind {
  if (check.conclusion === "TIMED_OUT") return "timeout";
  if (TIMEOUT_PATTERNS.some((re) => re.test(logs))) return "timeout";

  if (check.conclusion === "CANCELLED" && INFRA_PATTERNS.some((re) => re.test(logs))) {
    return "infrastructure";
  }

  if (!logs.trim()) return "infrastructure";

  if (/flaky|timing|race condition|retry/i.test(logs)) return "flaky";

  return "actionable";
}
