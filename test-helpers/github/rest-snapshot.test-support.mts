import { serve, pull, prefix } from "./rest-read.test-support.mts";

export async function serveRestSnapshot(
  options: {
    pull?: Record<string, unknown> | ((read: number) => Record<string, unknown>);
    checks?: unknown[];
    suites?: unknown[];
    workflows?: unknown[];
    statuses?: unknown[];
    inline?: unknown[];
    comments?: unknown[];
    reviews?: unknown[];
    threads?: unknown[];
    stack?: Record<string, unknown>;
  } = {},
) {
  let pulls = 0;
  await serve((request, response) => {
    const path = request.path.split("?")[0];
    let body: unknown = [];
    if (path === "/user") body = { login: "author" };
    else if (path === `${prefix}/pulls/101`) {
      const overrides = typeof options.pull === "function" ? options.pull(++pulls) : options.pull;
      body = { ...pull, ...overrides };
    } else if (path === prefix)
      body = { allow_merge_commit: true, allow_squash_merge: true, allow_rebase_merge: false };
    else if (path?.endsWith("check-runs"))
      body = { total_count: options.checks?.length ?? 0, check_runs: options.checks ?? [] };
    else if (path?.endsWith("check-suites"))
      body = { total_count: options.suites?.length ?? 0, check_suites: options.suites ?? [] };
    else if (path?.endsWith("actions/runs"))
      body = {
        total_count: options.workflows?.length ?? 0,
        workflow_runs: options.workflows ?? [],
      };
    else if (path?.endsWith("statuses")) body = options.statuses ?? [];
    else if (path?.endsWith("/protection")) body = {};
    else if (path === `${prefix}/pulls/101/comments`) body = options.inline ?? [];
    else if (path === `${prefix}/issues/101/comments`) body = options.comments ?? [];
    else if (path?.endsWith("/reviews")) body = options.reviews ?? [];
    else if (path?.endsWith("/ccr/review_threads")) body = options.threads ?? [];
    else if (path === `${prefix}/stacks`) body = options.stack ? [options.stack] : [];
    else if (path?.startsWith(`${prefix}/stacks/`)) body = options.stack;
    response.end(JSON.stringify(body));
  });
}

export const suite = {
  id: 66,
  node_id: "CS_66",
  status: "completed",
  conclusion: "startup_failure",
  created_at: "2026-10-09T00:00:00Z",
  updated_at: "2026-10-09T00:01:00Z",
};
export const workflow = {
  id: 88,
  check_suite_id: 66,
  workflow_id: 44,
  event: "pull_request",
  name: "CI",
  html_url: "https://github.com/octocat/hello-world/actions/runs/88",
  created_at: suite.created_at,
  updated_at: suite.updated_at,
};
export const check = {
  id: 77,
  node_id: "CR_77",
  name: "build",
  status: "completed",
  conclusion: "success",
  details_url: workflow.html_url,
  started_at: suite.created_at,
  completed_at: suite.updated_at,
  check_suite: { id: 66 },
  output: { title: "Built", summary: "ok", annotations_count: 1 },
};
