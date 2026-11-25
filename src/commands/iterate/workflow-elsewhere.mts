import type { RepoInfo } from "../../github/client.mts";
import {
  readWorkflowElsewhere,
  resolveWorkflowId,
  summarizeElsewhereError,
  type WorkflowElsewhereReadResult,
} from "../../github/workflow-elsewhere-read.mts";
import { stampSameJob } from "../../github/workflow-elsewhere-parse.mts";
import { queueRemovalSignature } from "../../state/queue-removal-follow-up.mts";
import { loadDerived, storeDerived, type StateKey } from "../../state/rest-cache.mts";
import type {
  AgentCheck,
  ElsewhereRun,
  ElsewhereScope,
  ShepherdReport,
  TriagedCheck,
} from "../../types.mts";

/** Cache TTL so later default-branch failures/recoveries appear on subsequent ticks. */
const ELSEWHERE_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedElsewhere {
  runs: ElsewhereRun[];
  scope: ElsewhereScope;
  cachedAtMs: number;
}

export interface AttachWorkflowElsewhereInput {
  checks: AgentCheck[];
  rawFailing: TriagedCheck[];
  report: ShepherdReport;
  repo: RepoInfo;
  stateKey: StateKey;
  ejectionCommit: string;
  compareWindowHours: number;
  nowMs?: number;
}

function isActionsProvenance(raw: TriagedCheck | undefined): boolean {
  return Boolean(
    raw &&
    (raw.source === "startup_failure" ||
      raw.workflowId !== undefined ||
      raw.workflowName !== undefined),
  );
}

function isFreshCached(value: unknown, nowMs: number): value is CachedElsewhere {
  const e = value as Partial<CachedElsewhere> | null;
  return Boolean(
    e &&
    Array.isArray(e.runs) &&
    typeof e.scope?.since === "string" &&
    typeof e.scope?.defaultBranch?.branch === "string" &&
    typeof e.scope?.mergeQueue?.runsRead === "number" &&
    typeof e.cachedAtMs === "number" &&
    nowMs - e.cachedAtMs >= 0 &&
    nowMs - e.cachedAtMs < ELSEWHERE_CACHE_TTL_MS,
  );
}

/**
 * Enrich failing `merge_group` Actions checks belonging to the current queue removal with recent
 * runs of the same workflow on the default branch and other queue entries. Cached briefly per
 * removal; incomplete or failed reads are never cached and surface `elsewhereUnread`.
 */
export async function attachWorkflowElsewhere(
  input: AttachWorkflowElsewhereInput,
): Promise<AgentCheck[]> {
  const { checks, rawFailing, report, repo, stateKey, ejectionCommit, compareWindowHours } = input;
  const nowMs = input.nowMs ?? Date.now();
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
    if (
      raw.runId !== null &&
      raw.scope === "merge_group" &&
      raw.commitOid === ejectionCommit &&
      (!rawByRunId.has(raw.runId) || raw.workflowId !== undefined)
    ) {
      rawByRunId.set(raw.runId, raw);
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
      const outcome = { unread: summarizeElsewhereError(error) };
      workflowIdByRunId.set(runId, outcome);
      return outcome;
    }
  };

  const fetchForWorkflow = async (
    workflowId: string,
    currentRunId: string,
    raw: TriagedCheck,
    check: AgentCheck,
  ): Promise<WorkflowElsewhereReadResult> => {
    const memoized = outcomeByWorkflowId.get(workflowId);
    if (memoized) return memoized;
    const cacheName = `workflow-elsewhere:${signature}:wf:${workflowId}:h=${compareWindowHours}`;
    const stored = await loadDerived<CachedElsewhere>(stateKey, cacheName);
    if (stored && isFreshCached(stored.value, nowMs)) {
      const hit: WorkflowElsewhereReadResult = {
        runs: stored.value.runs,
        scope: stored.value.scope,
      };
      outcomeByWorkflowId.set(workflowId, hit);
      return hit;
    }
    const workflowName = raw.workflowName ?? check.workflowName;
    const workflowPath = raw.workflowPath ?? check.workflowPath;
    let outcome: WorkflowElsewhereReadResult;
    try {
      outcome = await readWorkflowElsewhere({
        repo,
        prNumber: report.pr,
        workflowId,
        ...(workflowName !== undefined && { workflowName }),
        ...(workflowPath !== undefined && { workflowPath }),
        currentRunId,
        currentCommitOid: ejectionCommit,
        windowStartMs,
        since,
      });
    } catch (error) {
      outcome = { unread: summarizeElsewhereError(error) };
    }
    outcomeByWorkflowId.set(workflowId, outcome);
    if ("runs" in outcome) {
      await storeDerived<CachedElsewhere>(
        stateKey,
        cacheName,
        { runs: outcome.runs, scope: outcome.scope, cachedAtMs: nowMs },
        report.headSha,
      );
    }
    return outcome;
  };

  const enriched: AgentCheck[] = [];
  for (const check of checks) {
    const raw =
      check.scope === "merge_group" && check.commitOid === ejectionCommit && check.runId
        ? rawByRunId.get(check.runId)
        : undefined;
    if (!isActionsProvenance(raw)) {
      enriched.push(check);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const resolved = await resolveForRun(check.runId!, raw!);
    if ("unread" in resolved) {
      enriched.push({ ...check, elsewhereUnread: resolved.unread });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const outcome = await fetchForWorkflow(resolved.id, check.runId!, raw!, check);
    if ("unread" in outcome) {
      enriched.push({ ...check, elsewhereUnread: outcome.unread });
    } else {
      enriched.push({
        ...check,
        elsewhere: stampSameJob(outcome.runs, check.name),
        elsewhereScope: outcome.scope,
      });
    }
  }
  return enriched;
}
