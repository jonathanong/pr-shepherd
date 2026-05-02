import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { rest } from "../../github/http.mts";
import type { ShepherdReport } from "../../types.mts";
import type {
  IterateResultSummary,
  RelevantCheck,
  IterateResult,
  IterateResultBase,
} from "../../types.mts";

const execFile = promisify(execFileCb);

export function buildSummary(report: ShepherdReport): IterateResultSummary {
  return {
    passing: report.checks.passing.length,
    skipped: report.checks.skipped.length,
    filtered: report.checks.filtered.length,
    inProgress: report.checks.inProgress.length,
  };
}

/**
 * Build the full list of CI checks relevant to PR readiness: triggered by a PR
 * event (or StatusContext with null event), completed, and not skipped/neutral.
 * Includes both passing and failing. Failing entries carry workflowName, jobName,
 * failedStep, and summary.
 */
export function buildRelevantChecks(report: ShepherdReport): RelevantCheck[] {
  const excluded = new Set([null, "SKIPPED", "NEUTRAL"]);
  const passing: RelevantCheck[] = report.checks.passing.flatMap((c) => {
    if (excluded.has(c.conclusion)) return [];
    const conclusion = c.conclusion as RelevantCheck["conclusion"];
    return [
      {
        name: c.name,
        conclusion,
        runId: c.runId,
        detailsUrl: c.detailsUrl || null,
        summary: c.summary,
      },
    ];
  });
  const failing: RelevantCheck[] = report.checks.failing.flatMap((c) => {
    if (excluded.has(c.conclusion)) return [];
    const conclusion = c.conclusion as RelevantCheck["conclusion"];
    return [
      {
        name: c.name,
        conclusion,
        runId: c.runId,
        detailsUrl: c.detailsUrl || null,
        ...(c.workflowName !== undefined && { workflowName: c.workflowName }),
        ...(c.jobName !== undefined && { jobName: c.jobName }),
        ...(c.failedStep !== undefined && { failedStep: c.failedStep }),
        ...(c.summary !== undefined && { summary: c.summary }),
      },
    ];
  });
  return [...passing, ...failing];
}

export async function getLastCommitTime(): Promise<number | null> {
  try {
    const { stdout } = await execFile("git", ["log", "-1", "--format=%ct", "HEAD"]);
    return parseInt(stdout.trim(), 10);
  } catch {
    return null;
  }
}

// Best-effort: cancelling a completed run is a no-op, not an error.
export async function tryCancelRun(
  runId: string,
  owner: string,
  repo: string,
): Promise<string | null> {
  try {
    await rest("POST", `/repos/${owner}/${repo}/actions/runs/${runId}/cancel`);
    return runId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // GitHub returns 409 when the run reached a terminal state — expected, not worth logging.
    if (/409|already completed|cannot cancel a workflow run that is completed/i.test(msg))
      return null;
    process.stderr.write(`pr-shepherd: cancel run ${runId} failed (ignored): ${msg}\n`);
    return null;
  }
}

export async function getCurrentHeadSha(): Promise<string | null> {
  try {
    const { stdout } = await execFile("git", ["rev-parse", "HEAD"]);
    return stdout.trim();
  } catch {
    return null;
  }
}

export function buildWaitLog(base: IterateResultBase): string {
  const { summary, remainingSeconds } = base;
  const parts: string[] = [`WAIT: ${summary.passing} passing, ${summary.inProgress} in-progress`];

  switch (base.mergeStatus) {
    case "BLOCKED":
      if (base.reviewDecision === "REVIEW_REQUIRED") parts.push("awaiting human review");
      else if (base.reviewDecision === "APPROVED") parts.push("awaiting additional approvals");
      else parts.push("awaiting human review or branch protection");
      break;
    case "BEHIND":
      parts.push("branch is behind base");
      break;
    case "DRAFT":
      parts.push("PR is a draft");
      break;
    case "UNSTABLE":
      parts.push("some checks are unstable");
      break;
  }

  if (remainingSeconds > 0) {
    parts.push(`${remainingSeconds}s until auto-cancel`);
  }

  return parts.join(" — ");
}

export function buildCooldownResult(prNumber: number, readyDelaySeconds: number): IterateResult {
  return {
    action: "cooldown",
    pr: prNumber,
    repo: "",
    status: "UNKNOWN",
    state: "UNKNOWN" as const,
    mergeStateStatus: "UNKNOWN",
    mergeStatus: "UNKNOWN",
    reviewDecision: null,
    copilotReviewInProgress: false,
    isDraft: false,
    shouldCancel: false,
    remainingSeconds: readyDelaySeconds,
    summary: { passing: 0, skipped: 0, filtered: 0, inProgress: 0 },
    baseBranch: "",
    checks: [],
    log: "SKIP: CI still starting — waiting for first check to appear",
  };
}
