import type { RepoInfo } from "./client.mts";
import type { RawContextNode } from "./batch-raw-types.mts";
import {
  readRestPages,
  restRepoPath,
  restCollection,
  restString,
  restNumber,
  malformedRest,
} from "./rest-reader-core.mts";
import { recordRestIdentity } from "./rest-identities.mts";
import { readRest as rest } from "./rest-reader-core.mts";

export interface RestSuite {
  id: number;
  node_id: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
}
interface RestCheck {
  id: number;
  node_id: string;
  name: string;
  status: string;
  conclusion: string | null;
  details_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  check_suite: { id: number } | null;
  output: { title: string | null; summary: string | null; annotations_count: number };
}
interface RestStatus {
  id: number;
  context: string;
  state: string;
  target_url: string | null;
  description: string | null;
  created_at: string;
}
export interface RestWorkflowRun {
  id: number;
  check_suite_id: number;
  event: string;
  workflow_id: number;
  name: string;
  created_at: string;
  updated_at: string;
  html_url: string;
}
export async function readRestCommitChecks(oid: string, repo: RepoInfo, pr = 0) {
  const prefix = restRepoPath(repo);
  const checks = await readRestPages<RestCheck>(
    `${prefix}/commits/${encodeURIComponent(oid)}/check-runs?filter=all`,
    (body) => restCollection(body, "check_runs") as RestCheck[],
  );
  const suites = await readRestPages<RestSuite>(
    `${prefix}/commits/${encodeURIComponent(oid)}/check-suites`,
    (body) => restCollection(body, "check_suites") as RestSuite[],
  );
  const statuses = await readRestPages<RestStatus>(
    `${prefix}/commits/${encodeURIComponent(oid)}/statuses`,
  );
  const workflowRuns = await readRestPages<RestWorkflowRun>(
    `${prefix}/actions/runs?head_sha=${encodeURIComponent(oid)}`,
    (body) => restCollection(body, "workflow_runs") as RestWorkflowRun[],
  );
  for (const suite of suites.nodes) {
    restNumber(suite.id, "check suite id");
    restString(suite.status, "check suite status");
    if (suite.conclusion !== null) restString(suite.conclusion, "check suite conclusion");
  }
  for (const run of workflowRuns.nodes) {
    restNumber(run.id, "workflow run id");
    restNumber(run.check_suite_id, "workflow check suite id");
    restNumber(run.workflow_id, "workflow id");
    restString(run.event, "workflow event");
  }
  const workflows = new Map(workflowRuns.nodes.map((run) => [run.check_suite_id, run]));
  const suiteMap = new Map(suites.nodes.map((suite) => [suite.id, suite]));
  const nodes: RawContextNode[] = [];
  const checkIds = new Set<string>();
  for (const check of checks.nodes) {
    restNumber(check.id, "check run id");
    restString(check.node_id, "check run node_id");
    restString(check.name, "check run name");
    restString(check.status, "check run status");
    if (
      !["QUEUED", "IN_PROGRESS", "COMPLETED", "WAITING", "PENDING", "REQUESTED"].includes(
        check.status.toUpperCase(),
      )
    )
      malformedRest("unknown check run status");
    if (
      check.conclusion !== null &&
      ![
        "ACTION_REQUIRED",
        "CANCELLED",
        "FAILURE",
        "NEUTRAL",
        "SKIPPED",
        "STALE",
        "STARTUP_FAILURE",
        "SUCCESS",
        "TIMED_OUT",
      ].includes(restString(check.conclusion, "check conclusion").toUpperCase())
    )
      malformedRest("unknown check conclusion");
    restNumber(check.output?.annotations_count, "check run annotation count");
    if (checkIds.has(check.node_id)) throw new Error("REST check run pagination duplicated an ID");
    checkIds.add(check.node_id);
    await recordRestIdentity(repo, pr, check.node_id, String(check.id), "check");
    const suite = check.check_suite ? suiteMap.get(check.check_suite.id) : undefined;
    const run = check.check_suite ? workflows.get(check.check_suite.id) : undefined;
    nodes.push({
      __typename: "CheckRun",
      id: check.node_id,
      name: check.name,
      status: check.status.toUpperCase(),
      conclusion: check.conclusion?.toUpperCase() ?? null,
      detailsUrl: check.details_url,
      startedAt: check.started_at,
      completedAt: check.completed_at,
      title: check.output.title,
      summary: check.output.summary,
      annotations: { totalCount: check.output.annotations_count, nodes: [] },
      checkSuite: suite
        ? {
            createdAt: suite.created_at,
            updatedAt: suite.updated_at,
            workflowRun: run
              ? {
                  databaseId: run.id,
                  event: run.event,
                  createdAt: run.created_at,
                  updatedAt: run.updated_at,
                  workflow: { name: run.name, databaseId: run.workflow_id },
                }
              : null,
          }
        : null,
    });
  }
  // REST statuses include history; only the latest status for each context is current.
  const latest = new Map<string, RestStatus>();
  for (const status of statuses.nodes) {
    restString(status.context, "status context");
    restString(status.state, "status state");
    if (
      !["PENDING", "EXPECTED", "SUCCESS", "FAILURE", "ERROR"].includes(status.state.toUpperCase())
    )
      malformedRest("unknown status context state");
    if (!Number.isFinite(Date.parse(status.created_at))) malformedRest("status context created_at");
    const old = latest.get(status.context);
    if (
      !old ||
      Date.parse(status.created_at) > Date.parse(old.created_at) ||
      (status.created_at === old.created_at && status.id > old.id)
    )
      latest.set(status.context, status);
  }
  for (const status of latest.values())
    nodes.push({
      __typename: "StatusContext",
      context: status.context,
      state: status.state.toUpperCase(),
      targetUrl: status.target_url,
      description: status.description,
      createdAt: status.created_at,
    });
  return {
    nodes,
    suites: suites.nodes,
    workflowRuns: workflowRuns.nodes,
    rateLimit: workflowRuns.rateLimit ?? checks.rateLimit,
  };
}

export async function readRestAnnotationCounts(oid: string, repo: RepoInfo) {
  const checks = await readRestPages<RestCheck>(
    `${restRepoPath(repo)}/commits/${encodeURIComponent(oid)}/check-runs?filter=all`,
    (body) => restCollection(body, "check_runs") as RestCheck[],
  );
  return checks.nodes.map((check) => ({
    __typename: "CheckRun" as const,
    id: restString(check.node_id, "check node_id"),
    annotations: { totalCount: restNumber(check.output?.annotations_count, "annotations_count") },
  }));
}

export async function readRestBehind(repo: RepoInfo, base: string, head: string): Promise<number> {
  const comparison = await rest<Record<string, unknown>>(
    "GET",
    `${restRepoPath(repo)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
  );
  return restNumber(comparison.behind_by, "compare behind_by");
}
