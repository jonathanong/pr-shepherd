// @ts-nocheck
/** Shared GraphQL and REST route helpers for `fixture.workflowElsewhere` in test-cases. */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function allRuns(cfg) {
  return [...(cfg?.defaultBranchRuns ?? []), ...(cfg?.queueRuns ?? [])];
}

function toGqlSuite(run, branchName?: string, cfg?: Record<string, unknown>) {
  const wfPath = run.workflowPath ?? cfg?.workflowPath;
  const wfName = run.workflowName ?? cfg?.workflowName;
  return {
    status: "COMPLETED",
    conclusion: run.conclusion,
    updatedAt: run.updatedAt,
    branch: branchName ? { name: branchName } : null,
    workflowRun: {
      databaseId: run.runId,
      event: run.event ?? (run.headBranch ? "merge_group" : "push"),
      updatedAt: run.updatedAt,
      file: wfPath ? { path: wfPath } : null,
      workflow: { databaseId: run.workflowId, ...(wfName ? { name: wfName } : {}) },
    },
    checkRuns: {
      nodes: (run.failedJobs ?? []).map((job) => ({
        name: job.name,
        conclusion: job.conclusion,
        annotations: {
          totalCount: job.annotationsTotal ?? (job.annotations ?? []).length,
          nodes: (job.annotations ?? []).slice(0, 3).map((ann) => ({
            path: ann.path,
            location: ann.line !== null ? { start: { line: ann.line } } : null,
            message: ann.message,
          })),
        },
      })),
    },
  };
}

/** Answer `DefaultBranchWorkflowRuns` and `QueueCommitCheckSuites` GraphQL queries from fixture data. */
export function graphqlWorkflowElsewhere(
  query: string,
  variables: Record<string, unknown> | undefined,
  fixture,
) {
  const cfg = fixture.workflowElsewhere;
  if (query.includes("query DefaultBranchWorkflowRuns")) {
    const branch = cfg?.defaultBranch ?? "main";
    const runs = cfg?.defaultBranchRuns ?? [];
    const byOid = new Map();
    for (const run of runs) {
      const existing = byOid.get(run.oid) ?? {
        oid: run.oid,
        committedDate: run.committedDate ?? run.updatedAt,
        checkSuites: { pageInfo: { hasNextPage: false }, nodes: [] },
      };
      existing.checkSuites.nodes.push(toGqlSuite(run, branch, cfg));
      byOid.set(run.oid, existing);
    }
    return {
      data: {
        repository: {
          defaultBranchRef: {
            name: branch,
            target: { history: { pageInfo: { hasNextPage: false }, nodes: [...byOid.values()] } },
          },
        },
      },
    };
  }
  if (query.includes("query QueueCommitCheckSuites")) {
    const queueRuns = cfg?.queueRuns ?? [];
    const repository: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(variables ?? {})) {
      const match = /^oid(\d+)$/.exec(key);
      if (!match) continue;
      const oid = String(value);
      const matching = queueRuns.filter((run) => run.oid === oid);
      repository[`c${match[1]}`] =
        matching.length > 0
          ? {
              oid,
              checkSuites: {
                pageInfo: { hasNextPage: false },
                nodes: matching.map((r) => toGqlSuite(r, undefined, cfg)),
              },
            }
          : null;
    }
    return { data: { repository } };
  }
  return undefined;
}

/** Answer REST workflow-elsewhere endpoints from the same `fixture.workflowElsewhere` data. */
export function restWorkflowElsewhere(
  method: string,
  url: string,
  prefix: string,
  fixture,
): Response | undefined {
  if (method !== "GET") return undefined;
  const parsed = new URL(url);
  const path = parsed.pathname;
  const cfg = fixture.workflowElsewhere;

  if (path === prefix) {
    return json({ default_branch: cfg?.defaultBranch ?? "main" });
  }
  const runMatch = new RegExp(`^${prefix}/actions/runs/(\\d+)$`).exec(path);
  if (runMatch) {
    const runId = runMatch[1];
    return json({ workflow_id: cfg?.workflowIdByRunId?.[runId] ?? 9001 });
  }
  const wfRunsMatch = new RegExp(`^${prefix}/actions/workflows/(\\d+)/runs$`).exec(path);
  if (wfRunsMatch) {
    const wfId = Number(wfRunsMatch[1]);
    const isQueue = parsed.searchParams.get("event") === "merge_group";
    const source = isQueue ? (cfg?.queueRuns ?? []) : (cfg?.defaultBranchRuns ?? []);
    const workflow_runs = source
      .filter((run) => run.workflowId === wfId)
      .map((run) => ({
        id: run.runId,
        name: run.workflowName ?? cfg?.workflowName ?? null,
        path: run.workflowPath ?? cfg?.workflowPath ?? null,
        head_sha: run.oid,
        head_branch: run.headBranch ?? cfg?.defaultBranch ?? "main",
        event: run.event ?? (isQueue ? "merge_group" : "push"),
        status: "completed",
        conclusion: run.conclusion.toLowerCase(),
        created_at: run.updatedAt,
        updated_at: run.updatedAt,
      }));
    return json({ workflow_runs });
  }
  const jobsMatch = new RegExp(`^${prefix}/actions/runs/(\\d+)(?:/attempts/\\d+)?/jobs$`).exec(
    path,
  );
  if (jobsMatch) {
    const runId = Number(jobsMatch[1]);
    const run = allRuns(cfg).find((candidate) => candidate.runId === runId);
    const jobs = (run?.failedJobs ?? []).map((job, idx) => ({
      id: job.id ?? runId * 100 + idx + 1,
      name: job.name,
      conclusion: job.conclusion.toLowerCase(),
    }));
    return json({ jobs });
  }
  const annMatch = new RegExp(`^${prefix}/check-runs/(\\d+)/annotations$`).exec(path);
  if (annMatch) {
    const jobId = Number(annMatch[1]);
    for (const run of allRuns(cfg)) {
      const jobs = run.failedJobs ?? [];
      for (const [idx, job] of jobs.entries()) {
        const id = job.id ?? run.runId * 100 + idx + 1;
        if (id === jobId) {
          return json(
            (job.annotations ?? []).map((ann) => ({
              path: ann.path,
              start_line: ann.line ?? 0,
              message: ann.message,
            })),
          );
        }
      }
    }
    return json([]);
  }
  return undefined;
}
