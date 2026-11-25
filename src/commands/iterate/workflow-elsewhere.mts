import type { RepoInfo } from "../../github/client.mts";
import { GitHubRequestError } from "../../github/errors.mts";
import {
  readWorkflowElsewhere,
  resolveWorkflowId,
  type WorkflowElsewhereReadResult,
} from "../../github/workflow-elsewhere-read.mts";
import { stampSameJob } from "../../github/workflow-elsewhere-parse.mts";
import { queueRemovalSignature } from "../../state/queue-removal-follow-up.mts";
import { loadDerived, storeDerived, type StateKey } from "../../state/rest-cache.mts";
import { pollRateLimitRetryAfterMs } from "../poll-quota.mts";
import type { AgentCheck, ElsewhereRun, ShepherdReport, TriagedCheck } from "../../types.mts";

const MAX_ERROR_CHARS = 120;

interface CachedElsewhere {
  runs: ElsewhereRun[];
  since: string;
}

export interface AttachWorkflowElsewhereInput {
  checks: AgentCheck[];
  rawFailing: TriagedCheck[];
  report: ShepherdReport;
  repo: RepoInfo;
  stateKey: StateKey;
  ejectionCommit: string;
  compareWindowHours: number;
}

function summarizeReadError(error: unknown): string {
  if (error instanceof GitHubRequestError) return `HTTP ${error.status}`;
  const raw = error instanceof Error ? error.message : String(error);
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return "request failed";
  return compact.length <= MAX_ERROR_CHARS ? compact : `${compact.slice(0, MAX_ERROR_CHARS - 1)}…`;
}

function isActionsProvenance(raw: TriagedCheck | undefined): boolean {
  if (!raw) return false;
  return (
    raw.source === "startup_failure" ||
    raw.workflowId !== undefined ||
    raw.workflowName !== undefined
  );
}

function isValidCached(value: unknown): value is CachedElsewhere {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as CachedElsewhere).runs) &&
    typeof (value as CachedElsewhere).since === "string"
  );
}

/**
 * Enrich failing `merge_group` Actions checks belonging to the current queue removal with recent
 * runs of the same workflow on the default branch and other queue entries. Cached per removal;
 * incomplete or failed reads are never cached and surface `elsewhereUnread`.
 */
export async function attachWorkflowElsewhere(
  input: AttachWorkflowElsewhereInput,
): Promise<AgentCheck[]> {
  const { checks, rawFailing, report, repo, stateKey, ejectionCommit, compareWindowHours } = input;
  const removal = report.mergeQueue?.latestRemoval;
  if (compareWindowHours <= 0 || !removal) return checks;

  const windowStartMs = Math.floor((removal.createdAtUnix - compareWindowHours * 3600) * 1000);
  const since = new Date(windowStartMs).toISOString().replace(/\.\d{3}Z$/, "Z");
  const signature = queueRemovalSignature({
    headSha: report.headSha ?? "unknown",
    createdAtUnix: removal.createdAtUnix,
    beforeCommitOid: ejectionCommit,
  });

  const rawByRunId = new Map<string, TriagedCheck>();
  for (const raw of rawFailing) {
    if (raw.runId !== null && raw.scope === "merge_group" && raw.commitOid === ejectionCommit) {
      if (!rawByRunId.has(raw.runId) || raw.workflowId !== undefined) {
        rawByRunId.set(raw.runId, raw);
      }
    }
  }

  const workflowIdByRunId = new Map<string, { id: string } | { unread: string }>();
  const outcomeByWorkflowId = new Map<string, WorkflowElsewhereReadResult>();

  const resolveForRun = async (
    runId: string,
    raw: TriagedCheck,
  ): Promise<{ id: string } | { unread: string }> => {
    const cached = workflowIdByRunId.get(runId);
    if (cached) return cached;
    if (raw.workflowId && /^\d+$/.test(raw.workflowId)) {
      const hit = { id: raw.workflowId };
      workflowIdByRunId.set(runId, hit);
      return hit;
    }
    try {
      const id = await resolveWorkflowId(repo, runId, stateKey);
      const outcome = id ? { id } : { unread: "workflow ID unavailable" };
      workflowIdByRunId.set(runId, outcome);
      return outcome;
    } catch (error) {
      if (pollRateLimitRetryAfterMs(error) !== null) throw error;
      const outcome = { unread: summarizeReadError(error) };
      workflowIdByRunId.set(runId, outcome);
      return outcome;
    }
  };

  const fetchForWorkflow = async (
    workflowId: string,
    currentRunId: string,
  ): Promise<WorkflowElsewhereReadResult> => {
    const memoized = outcomeByWorkflowId.get(workflowId);
    if (memoized) return memoized;
    const cacheName = `workflow-elsewhere:${signature}:wf:${workflowId}:h=${compareWindowHours}`;
    const stored = await loadDerived<CachedElsewhere>(stateKey, cacheName);
    if (stored && isValidCached(stored.value)) {
      const hit: WorkflowElsewhereReadResult = {
        runs: stored.value.runs,
        since: stored.value.since,
      };
      outcomeByWorkflowId.set(workflowId, hit);
      return hit;
    }
    let outcome: WorkflowElsewhereReadResult;
    try {
      outcome = await readWorkflowElsewhere({
        repo,
        prNumber: report.pr,
        workflowId,
        currentRunId,
        currentCommitOid: ejectionCommit,
        windowStartMs,
        since,
      });
    } catch (error) {
      if (pollRateLimitRetryAfterMs(error) !== null) throw error;
      outcome = { unread: summarizeReadError(error) };
    }
    outcomeByWorkflowId.set(workflowId, outcome);
    if ("runs" in outcome) {
      await storeDerived<CachedElsewhere>(
        stateKey,
        cacheName,
        { runs: outcome.runs, since: outcome.since },
        report.headSha,
      );
    }
    return outcome;
  };

  const enriched: AgentCheck[] = [];
  for (const check of checks) {
    if (check.scope !== "merge_group" || check.commitOid !== ejectionCommit || !check.runId) {
      enriched.push(check);
      continue;
    }
    const raw = rawByRunId.get(check.runId);
    if (!isActionsProvenance(raw)) {
      enriched.push(check);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const resolved = await resolveForRun(check.runId, raw!);
    if ("unread" in resolved) {
      enriched.push({ ...check, elsewhereUnread: resolved.unread });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const outcome = await fetchForWorkflow(resolved.id, check.runId);
    if ("unread" in outcome) {
      enriched.push({ ...check, elsewhereUnread: outcome.unread });
    } else {
      enriched.push({
        ...check,
        elsewhere: stampSameJob(outcome.runs, check.name),
        elsewhereSince: outcome.since,
      });
    }
  }
  return enriched;
}
