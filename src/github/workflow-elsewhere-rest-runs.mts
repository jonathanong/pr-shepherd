import { normalizeWorkflowPath } from "../checks/workflow-path.mts";
import { rest } from "./http.mts";
import type { RestRunCandidate, RestWorkflowRunItem } from "../types/workflow-elsewhere-raw.mts";

const REST_RUNS_PER_PAGE = 30;
const MAX_RUN_PAGES = 3;

interface RestRunsPayload {
  workflow_runs?: RestWorkflowRunItem[];
}

function extractRestWorkflowMeta(items: readonly RestWorkflowRunItem[]): {
  workflowName?: string;
  workflowPath?: string;
} {
  let workflowName: string | undefined;
  let workflowPath: string | undefined;
  for (const item of items) {
    if (!workflowName && item.name?.trim()) workflowName = item.name.trim();
    if (!workflowPath) workflowPath = normalizeWorkflowPath(item.path);
    if (workflowName && workflowPath) break;
  }
  return {
    ...(workflowName !== undefined && { workflowName }),
    ...(workflowPath !== undefined && { workflowPath }),
  };
}

/**
 * Page REST workflow runs up to `MAX_RUN_PAGES` until `targetCount` candidates are found, a page
 * is partial, or one full page past the `created_at < windowStartMs` cutoff has been read (so
 * re-runs of older runs completing inside the window are seen). Returns `unread` if the budget
 * exhausts before that condition is met.
 */
export async function fetchRestWorkflowRunsPaged(
  baseQuery: string,
  windowStartMs: number,
  select: (items: readonly RestWorkflowRunItem[]) => {
    candidates: RestRunCandidate[];
    matched: number;
  },
  targetCount: number,
): Promise<
  | {
      candidates: RestRunCandidate[];
      matched: number;
      runsRead: number;
      workflowName?: string;
      workflowPath?: string;
    }
  | { unread: string }
> {
  const all: RestWorkflowRunItem[] = [];
  let sawPreWindowPage = false;
  for (let page = 1; page <= MAX_RUN_PAGES; page++) {
    // eslint-disable-next-line no-await-in-loop
    const payload = await rest<RestRunsPayload>(
      "GET",
      `${baseQuery}&per_page=${REST_RUNS_PER_PAGE}&page=${page}`,
    );
    if (!Array.isArray(payload?.workflow_runs))
      return { unread: "malformed workflow runs response" };
    const items = payload.workflow_runs;
    all.push(...items);
    const { candidates, matched } = select(all);
    if (items.length < REST_RUNS_PER_PAGE || candidates.length >= targetCount || sawPreWindowPage) {
      return { candidates, matched, runsRead: all.length, ...extractRestWorkflowMeta(all) };
    }
    const oldestCreatedMs = Date.parse(items[items.length - 1]!.created_at);
    if (Number.isFinite(oldestCreatedMs) && oldestCreatedMs < windowStartMs) {
      sawPreWindowPage = true;
    }
  }
  return { unread: "workflow runs pagination truncated" };
}
