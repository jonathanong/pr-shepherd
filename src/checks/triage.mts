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

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { ClassifiedCheck, TriagedCheck, FailureKind } from "../types.mts";
import { loadConfig } from "../config/load.mts";

const execFile = promisify(execFileCb);

const config = loadConfig();
const TIMEOUT_PATTERNS = config.checks.timeoutPatterns.map((p) => new RegExp(p, "i"));
const INFRA_PATTERNS = config.checks.infraPatterns.map((p) => new RegExp(p, "i"));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch logs and triage each failing check.
 *
 * Fetching logs is skipped for checks that have no `runId` (e.g. StatusContext nodes).
 */
export function triageFailingChecks(failingChecks: ClassifiedCheck[]): Promise<TriagedCheck[]> {
  return Promise.all(failingChecks.map((c) => triageCheck(c)));
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function triageCheck(check: ClassifiedCheck): Promise<TriagedCheck> {
  if (check.runId === null) {
    return { ...check, failureKind: "actionable" };
  }

  const logExcerpt = await fetchFailedLogs(check.runId);
  const failureKind = classifyLogs(check, logExcerpt);

  return {
    ...check,
    failureKind,
    logExcerpt: logExcerpt.slice(-config.checks.logMaxChars) || undefined,
  };
}

async function fetchFailedLogs(runId: string): Promise<string> {
  try {
    const { stdout } = await execFile("gh", ["run", "view", runId, "--log-failed"], {
      maxBuffer: config.execution.triageLogBufferMb * 1024 * 1024,
    });
    // Strip ANSI escape codes.
    // eslint-disable-next-line no-control-regex
    const ansiEscapes = /\u001B\[[0-9;]*m/g;
    return stdout.replace(ansiEscapes, "").split("\n").slice(-config.checks.logMaxLines).join("\n");
  } catch {
    return "";
  }
}

function classifyLogs(check: ClassifiedCheck, logs: string): FailureKind {
  // Timed out — check conclusion first, then logs.
  if (check.conclusion === "TIMED_OUT") return "timeout";
  if (TIMEOUT_PATTERNS.some((re) => re.test(logs))) return "timeout";

  // Infrastructure error — typically CANCELLED with infra markers in logs.
  if (check.conclusion === "CANCELLED" && INFRA_PATTERNS.some((re) => re.test(logs))) {
    return "infrastructure";
  }

  // No logs at all — treat as infrastructure.
  if (!logs.trim()) return "infrastructure";

  // Heuristic: if the failure is in a file the PR likely didn't touch
  // and the message contains "flaky" or timing language, call it flaky.
  if (/flaky|timing|race condition|retry/i.test(logs)) return "flaky";

  // Default: assume actionable.
  return "actionable";
}
