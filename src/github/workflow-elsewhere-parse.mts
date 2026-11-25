import { normalizeWorkflowPath } from "../checks/workflow-path.mts";
import type {
  ElsewhereAnnotation,
  ElsewhereFailedJob,
  ElsewhereRun,
} from "../types/workflow-elsewhere.mts";
import type {
  ParsedDefaultBranchRuns,
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
  const s = (raw ?? "").replace(/\s+/g, " ").trim();
  return s.length <= MAX_ANNOTATION_MESSAGE_CHARS
    ? s
    : `${s.slice(0, MAX_ANNOTATION_MESSAGE_CHARS - 1)}…`;
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
    const c = run?.conclusion?.toUpperCase() ?? "";
    return c === "FAILURE" || c === "TIMED_OUT";
  });
  return failed.slice(0, MAX_ELSEWHERE_FAILED_JOBS).map((run) => {
    const annotations: ElsewhereAnnotation[] = (run!.annotations?.nodes ?? [])
      .slice(0, MAX_ELSEWHERE_ANNOTATIONS)
      .map((ann) => ({
        path: (ann!.path ?? "").trim(),
        line:
          typeof ann!.location?.start?.line === "number" && ann!.location.start.line > 0
            ? ann!.location.start.line
            : null,
        message: normalizeAnnotationMessage(ann!.message),
      }));
    const total = run!.annotations?.totalCount;
    const more =
      typeof total === "number" && total > annotations.length
        ? total - annotations.length
        : undefined;
    return {
      name: run!.name,
      conclusion: run!.conclusion!.toUpperCase(),
      annotations,
      ...(more !== undefined && { moreAnnotations: more }),
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
  const ms = ts ? Date.parse(ts) : Number.NaN;
  return Number.isFinite(ms) && ms >= windowStartMs;
}

const emptyDefaultResult = (extra: Partial<ParsedDefaultBranchRuns>): ParsedDefaultBranchRuns => ({
  runs: [],
  incomplete: false,
  commitsRead: 0,
  matched: 0,
  matchedComplete: false,
  ...extra,
});

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
    return emptyDefaultResult({ unavailable: "default branch history unavailable" });
  }
  const nullAnnotations = commits.some((c) => stripNullAnnotations(c?.checkSuites?.nodes));
  const nullSuites = commits.some((c) => c?.checkSuites === null);
  if (unread || nullAnnotations || nullSuites) {
    return emptyDefaultResult({ incomplete: true, commitsRead: commits.length });
  }

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
  const truncated =
    truncatedSuites || (Boolean(history?.pageInfo?.hasNextPage) && lastCommitInWindow);
  if (truncated && byRunId.size < MAX_ELSEWHERE_RUNS_PER_SOURCE) {
    return emptyDefaultResult({
      unavailable: "default branch workflow history truncated",
      branch: defaultRef.name,
      commitsRead: commits.length,
      matched: byRunId.size,
    });
  }
  return {
    ...emptyDefaultResult({
      branch: defaultRef.name,
      commitsRead: commits.length,
      matched: byRunId.size,
      matchedComplete: !truncated,
    }),
    runs: sortNewestFirst([...byRunId.values()]).slice(0, MAX_ELSEWHERE_RUNS_PER_SOURCE),
    ...(workflowName !== undefined && { workflowName }),
    ...(workflowPath !== undefined && { workflowPath }),
  };
}

export function stampSameJob(runs: readonly ElsewhereRun[], checkName: string): ElsewhereRun[] {
  return runs.map((run) => ({
    ...run,
    failedJobs: run.failedJobs.map((j) =>
      j.name === checkName ? { ...j, sameJob: true as const } : { ...j },
    ),
  }));
}
