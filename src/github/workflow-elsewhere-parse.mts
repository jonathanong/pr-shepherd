import { normalizeWorkflowPath } from "../checks/workflow-path.mts";
import type {
  ElsewhereAnnotation,
  ElsewhereFailedJob,
  ElsewhereRun,
} from "../types/workflow-elsewhere.mts";
import type {
  RawDefaultBranchRunsResponse,
  RawElsewhereSuite,
} from "../types/workflow-elsewhere-raw.mts";
import { dropNullNodes } from "./null-nodes.mts";

export const MAX_ELSEWHERE_RUNS_PER_SOURCE = 3;
export const MAX_ELSEWHERE_FAILED_JOBS = 15;
export const MAX_ELSEWHERE_ANNOTATIONS = 3;
const MAX_ANNOTATION_MESSAGE_CHARS = 240;

export const NON_DEFAULT_BRANCH_EVENTS = new Set([
  "pull_request",
  "pull_request_target",
  "merge_group",
]);

/** Collapse newlines and whitespace and bound an annotation message for single-line display. */
export function normalizeAnnotationMessage(raw: string | null | undefined): string {
  const collapsed = (raw ?? "").replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_ANNOTATION_MESSAGE_CHARS) return collapsed;
  return `${collapsed.slice(0, MAX_ANNOTATION_MESSAGE_CHARS - 1)}…`;
}

/** Remove null annotation entries in place and report whether any were present. */
export function stripNullAnnotations(suites: Array<RawElsewhereSuite | null> | undefined): boolean {
  let foundNull = false;
  for (const suite of suites ?? []) {
    for (const checkRun of suite?.checkRuns?.nodes ?? []) {
      const nodes = checkRun?.annotations?.nodes;
      if (!Array.isArray(nodes)) continue;
      const kept = nodes.filter((node) => node !== null);
      if (kept.length !== nodes.length) {
        foundNull = true;
        checkRun!.annotations!.nodes = kept;
      }
    }
  }
  return foundNull;
}

/** Extract failed/timed-out check runs and up to 3 annotations per job from one GraphQL suite. */
export function mapFailedJobs(suite: RawElsewhereSuite | undefined): ElsewhereFailedJob[] {
  const failed = (suite?.checkRuns?.nodes ?? []).filter((run) => {
    const conclusion = run?.conclusion?.toUpperCase() ?? "";
    return conclusion === "FAILURE" || conclusion === "TIMED_OUT";
  });
  return failed.slice(0, MAX_ELSEWHERE_FAILED_JOBS).map((run) => {
    const annotations: ElsewhereAnnotation[] = (run!.annotations?.nodes ?? [])
      .slice(0, MAX_ELSEWHERE_ANNOTATIONS)
      .map((ann) => {
        const rawLine = ann!.location?.start?.line;
        const line = typeof rawLine === "number" && rawLine > 0 ? rawLine : null;
        return {
          path: (ann!.path ?? "").trim(),
          line,
          message: normalizeAnnotationMessage(ann!.message),
        };
      });
    const total = run!.annotations?.totalCount;
    const moreAnnotations =
      typeof total === "number" && total > annotations.length
        ? total - annotations.length
        : undefined;
    return {
      name: run!.name,
      conclusion: run!.conclusion!.toUpperCase(),
      annotations,
      ...(moreAnnotations !== undefined && { moreAnnotations }),
    };
  });
}

/** Sort runs newest-first by completion timestamp, breaking ties by numeric run ID descending. */
export function sortNewestFirst<T extends { completedAt: string; runId: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      Date.parse(b.completedAt) - Date.parse(a.completedAt) || Number(b.runId) - Number(a.runId),
  );
}

function suiteUpdatedInWindow(suite: RawElsewhereSuite | null, windowStartMs: number): boolean {
  const ts = suite?.workflowRun?.updatedAt ?? suite?.updatedAt;
  if (!ts) return false;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) && ms >= windowStartMs;
}

export interface ParsedDefaultBranchRuns {
  runs: ElsewhereRun[];
  incomplete: boolean;
  unavailable?: string;
  branch?: string;
  commitsRead: number;
  matched: number;
  workflowName?: string;
  workflowPath?: string;
}

export function parseDefaultBranchRuns(
  data: RawDefaultBranchRunsResponse,
  workflowId: string,
  windowStartMs: number,
): ParsedDefaultBranchRuns {
  const unread = dropNullNodes(data);
  const defaultRef = data.repository?.defaultBranchRef;
  const history = defaultRef?.target?.history;
  const commits = history?.nodes;
  if (!defaultRef?.name || !Array.isArray(commits)) {
    return {
      runs: [],
      incomplete: false,
      unavailable: "default branch history unavailable",
      commitsRead: 0,
      matched: 0,
    };
  }
  const nullAnnotations = commits.some((c) => stripNullAnnotations(c?.checkSuites?.nodes));
  if (unread || nullAnnotations)
    return { runs: [], incomplete: true, commitsRead: commits.length, matched: 0 };

  const targetId = Number(workflowId);
  const byRunId = new Map<string, ElsewhereRun>();
  let truncatedSuites = false;
  let lastCommitInWindow = false;
  let workflowName: string | undefined;
  let workflowPath: string | undefined;
  for (const commit of commits) {
    let matchedOnCommit = false;
    let hasInWindowSuite = false;
    for (const suite of commit!.checkSuites?.nodes ?? []) {
      if (suiteUpdatedInWindow(suite, windowStartMs)) hasInWindowSuite = true;
      const wfRun = suite!.workflowRun;
      if (!wfRun || wfRun.workflow?.databaseId !== targetId) continue;
      if (!workflowName && wfRun.workflow.name?.trim()) workflowName = wfRun.workflow.name.trim();
      if (!workflowPath) workflowPath = normalizeWorkflowPath(wfRun.file?.path);
      if (wfRun.databaseId == null || !Number.isSafeInteger(wfRun.databaseId)) continue;
      if (suite!.branch?.name && suite!.branch.name !== defaultRef.name) continue;
      if (wfRun.event && NON_DEFAULT_BRANCH_EVENTS.has(wfRun.event)) continue;
      if (!suite!.conclusion || (suite!.status && suite!.status !== "COMPLETED")) continue;
      const completedAt = wfRun.updatedAt ?? suite!.updatedAt ?? commit!.committedDate;
      const completedMs = Date.parse(completedAt);
      if (!Number.isFinite(completedMs) || completedMs < windowStartMs) continue;
      matchedOnCommit = true;
      const runId = String(wfRun.databaseId);
      if (byRunId.has(runId)) continue;
      byRunId.set(runId, {
        source: "default-branch",
        branch: defaultRef.name,
        headSha: commit!.oid.slice(0, 7),
        runId,
        conclusion: suite!.conclusion.toUpperCase(),
        completedAt,
        failedJobs: mapFailedJobs(suite!),
      });
    }
    const commitMs = Date.parse(commit!.committedDate);
    lastCommitInWindow =
      hasInWindowSuite || !Number.isFinite(commitMs) || commitMs >= windowStartMs;
    if (lastCommitInWindow && commit!.checkSuites?.pageInfo?.hasNextPage && !matchedOnCommit) {
      truncatedSuites = true;
    }
  }
  const truncatedHistory = Boolean(history?.pageInfo?.hasNextPage) && lastCommitInWindow;
  if ((truncatedSuites || truncatedHistory) && byRunId.size < MAX_ELSEWHERE_RUNS_PER_SOURCE) {
    return {
      runs: [],
      incomplete: false,
      unavailable: "default branch workflow history truncated",
      branch: defaultRef.name,
      commitsRead: commits.length,
      matched: byRunId.size,
    };
  }
  return {
    runs: sortNewestFirst([...byRunId.values()]).slice(0, MAX_ELSEWHERE_RUNS_PER_SOURCE),
    incomplete: false,
    branch: defaultRef.name,
    commitsRead: commits.length,
    matched: byRunId.size,
    ...(workflowName !== undefined && { workflowName }),
    ...(workflowPath !== undefined && { workflowPath }),
  };
}

/** Mark exact-name job matches on a copy of the workflow's elsewhere runs. */
export function stampSameJob(runs: readonly ElsewhereRun[], checkName: string): ElsewhereRun[] {
  return runs.map((run) => ({
    ...run,
    failedJobs: run.failedJobs.map((job) =>
      job.name === checkName ? { ...job, sameJob: true as const } : { ...job },
    ),
  }));
}
