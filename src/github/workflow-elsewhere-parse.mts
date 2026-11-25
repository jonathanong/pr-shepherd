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
    return { name: run!.name, conclusion: run!.conclusion!.toUpperCase(), annotations };
  });
}

/** Sort runs newest-first by completion timestamp, breaking ties by numeric run ID descending. */
export function sortNewestFirst<T extends { completedAt: string; runId: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const timeDiff = Date.parse(b.completedAt) - Date.parse(a.completedAt);
    if (timeDiff !== 0) return timeDiff;
    return Number(b.runId) - Number(a.runId);
  });
}

/**
 * Parse default-branch workflow runs from GraphQL history. Returns `incomplete: true` when any
 * connection contained a `null` node, or `unavailable` when default-branch history was absent or
 * truncated before establishing the window's top runs.
 */
export function parseDefaultBranchRuns(
  data: RawDefaultBranchRunsResponse,
  workflowId: string,
  windowStartMs: number,
): { runs: ElsewhereRun[]; incomplete: boolean; unavailable?: string } {
  const unread = dropNullNodes(data);
  const defaultRef = data.repository?.defaultBranchRef;
  const history = defaultRef?.target?.history;
  const commits = history?.nodes;
  if (!defaultRef?.name || !Array.isArray(commits)) {
    return { runs: [], incomplete: false, unavailable: "default branch history unavailable" };
  }
  let nullAnnotations = false;
  for (const commit of commits) {
    if (stripNullAnnotations(commit?.checkSuites?.nodes)) nullAnnotations = true;
  }
  if (unread || nullAnnotations) return { runs: [], incomplete: true };

  const targetId = Number(workflowId);
  const byRunId = new Map<string, ElsewhereRun>();
  let truncatedSuites = false;
  for (const commit of commits) {
    let matchedOnCommit = false;
    for (const suite of commit!.checkSuites?.nodes ?? []) {
      const wfRun = suite!.workflowRun;
      if (!wfRun || wfRun.workflow?.databaseId !== targetId) continue;
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
    if (commit!.checkSuites?.pageInfo?.hasNextPage && !matchedOnCommit) truncatedSuites = true;
  }
  const oldestCommit = commits[commits.length - 1];
  const truncatedHistory =
    Boolean(history?.pageInfo?.hasNextPage) &&
    oldestCommit !== undefined &&
    Date.parse(oldestCommit!.committedDate) >= windowStartMs;
  if ((truncatedSuites || truncatedHistory) && byRunId.size < MAX_ELSEWHERE_RUNS_PER_SOURCE) {
    return {
      runs: [],
      incomplete: false,
      unavailable: "default branch workflow history truncated",
    };
  }
  return {
    runs: sortNewestFirst([...byRunId.values()]).slice(0, MAX_ELSEWHERE_RUNS_PER_SOURCE),
    incomplete: false,
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
