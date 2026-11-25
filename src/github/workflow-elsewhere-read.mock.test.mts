import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { mockGraphql, mockRest } = vi.hoisted(() => ({ mockGraphql: vi.fn(), mockRest: vi.fn() }));
vi.mock("./client.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client.mts")>()),
  graphql: mockGraphql,
}));
vi.mock("./http.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./http.mts")>()),
  rest: mockRest,
}));

import { readWorkflowElsewhere, resolveWorkflowId } from "./workflow-elsewhere-read.mts";
import { runWithGithubTransport } from "./transport.mts";

const REPO = { owner: "owner", name: "repo" };
const BASE = {
  repo: REPO,
  prNumber: 42,
  workflowId: "7001",
  currentRunId: "100",
  currentCommitOid: "q-cur",
  windowStartMs: Date.parse("2024-05-15T11:30:00Z"),
  since: "2024-05-15T11:30:00Z",
};
const defaultHistory = (nodes: unknown[]) => ({
  data: { repository: { defaultBranchRef: { name: "main", target: { history: { nodes } } } } },
});
const runGql = () => runWithGithubTransport("graphql", () => readWorkflowElsewhere(BASE));

describe("workflow-elsewhere-read (GraphQL & resolveWorkflowId)", () => {
  let stateDir: string;
  let stateKey: { owner: string; repo: string; pr: number };

  beforeEach(() => {
    vi.clearAllMocks();
    stateDir = mkdtempSync(join(tmpdir(), "wf-elsewhere-read-"));
    vi.stubEnv("PR_SHEPHERD_STATE_DIR", stateDir);
    stateKey = { owner: "owner", repo: "repo", pr: 42 };
    return () => {
      vi.unstubAllEnvs();
      rmSync(stateDir, { recursive: true, force: true });
    };
  });

  it("resolves workflow_id via REST and caches it per runId", async () => {
    mockRest.mockResolvedValueOnce({ workflow_id: 7001 });
    expect(await resolveWorkflowId(REPO, "100", stateKey)).toBe("7001");
    expect(await resolveWorkflowId(REPO, "100", stateKey)).toBe("7001");
    expect(mockRest).toHaveBeenCalledTimes(1);

    mockRest.mockResolvedValueOnce({ workflow_id: null });
    expect(await resolveWorkflowId(REPO, "101", stateKey)).toBeUndefined();
  });

  it("reads GraphQL default branch + REST queue runs + aliased GraphQL queue commits", async () => {
    const suite = {
      status: "COMPLETED",
      conclusion: "SUCCESS",
      updatedAt: "2024-05-15T14:05:00Z",
      workflowRun: {
        databaseId: 501,
        event: "push",
        updatedAt: "2024-05-15T14:05:00Z",
        file: { path: ".github/workflows/ci.yml" },
        workflow: { databaseId: 7001, name: "CI" },
      },
      checkRuns: { nodes: [] },
    };
    const qSuite = {
      workflowRun: { databaseId: 601 },
      checkRuns: {
        nodes: [
          {
            name: "test (1/4)",
            conclusion: "FAILURE",
            annotations: {
              nodes: [{ path: "a.ts", location: { start: { line: 9 } }, message: "err" }],
            },
          },
        ],
      },
    };
    mockGraphql
      .mockResolvedValueOnce(
        defaultHistory([
          {
            oid: "a1b2c3d999",
            committedDate: "2024-05-15T14:00:00Z",
            checkSuites: { nodes: [suite] },
          },
        ]),
      )
      .mockResolvedValueOnce({
        data: { repository: { c0: { oid: "f00ba12999", checkSuites: { nodes: [qSuite] } } } },
      });
    mockRest.mockResolvedValueOnce({
      workflow_runs: [
        {
          id: 601,
          head_sha: "f00ba12999",
          head_branch: "gh-readonly-queue/main/pr-812-f00ba12",
          status: "completed",
          conclusion: "failure",
          created_at: "2024-05-15T14:10:00Z",
          updated_at: "2024-05-15T14:12:00Z",
        },
      ],
    });
    expect(await runGql()).toEqual({
      scope: {
        workflowName: "CI",
        workflowPath: ".github/workflows/ci.yml",
        since: "2024-05-15T11:30:00Z",
        defaultBranch: { branch: "main", commitsRead: 1, matched: 1, shown: 1 },
        mergeQueue: { runsRead: 1, matched: 1, shown: 1 },
      },
      runs: [
        {
          source: "merge-queue",
          pr: 812,
          headSha: "f00ba12",
          runId: "601",
          conclusion: "FAILURE",
          completedAt: "2024-05-15T14:12:00Z",
          failedJobs: [
            {
              name: "test (1/4)",
              conclusion: "FAILURE",
              annotations: [{ path: "a.ts", line: 9, message: "err" }],
            },
          ],
        },
        {
          source: "default-branch",
          branch: "main",
          headSha: "a1b2c3d",
          runId: "501",
          conclusion: "SUCCESS",
          completedAt: "2024-05-15T14:05:00Z",
          failedJobs: [],
        },
      ],
    });
  });

  it("skips second GraphQL query for all-SUCCESS queue runs and reports unread on null or malformed payloads", async () => {
    const qRun = (id: number, sha: string, pr: number, conclusion: string) => ({
      workflow_runs: [
        {
          id,
          head_sha: sha,
          head_branch: `gh-readonly-queue/main/pr-${pr}-${sha}`,
          status: "completed",
          conclusion,
          created_at: "2024-05-15T14:00:00Z",
        },
      ],
    });
    mockGraphql.mockResolvedValueOnce(defaultHistory([]));
    mockRest.mockResolvedValueOnce(qRun(602, "bbb1234", 813, "success"));
    const ok = await runGql();
    expect("runs" in ok && ok.runs).toHaveLength(1);
    expect(mockGraphql).toHaveBeenCalledTimes(1);

    mockGraphql.mockResolvedValueOnce({ data: { repository: null } });
    expect(await runGql()).toEqual({ unread: "default branch history unavailable" });

    mockGraphql.mockResolvedValueOnce(defaultHistory([null]));
    expect(await runGql()).toEqual({ unread: "GitHub returned incomplete (null) nodes" });

    mockGraphql.mockResolvedValueOnce(defaultHistory([]));
    mockRest.mockResolvedValueOnce({});
    expect(await runGql()).toEqual({ unread: "malformed workflow runs response" });

    mockGraphql
      .mockResolvedValueOnce(defaultHistory([]))
      .mockResolvedValueOnce({ data: { repository: { c0: null } } });
    mockRest.mockResolvedValueOnce(qRun(604, "ddd", 815, "failure"));
    expect(await runGql()).toEqual({ unread: "merge-queue commit check suite unavailable" });

    mockGraphql.mockResolvedValueOnce(defaultHistory([])).mockResolvedValueOnce({
      data: { repository: { c0: { oid: "aaa", checkSuites: { nodes: [null] } } } },
    });
    mockRest.mockResolvedValueOnce(qRun(603, "aaa", 814, "failure"));
    expect(await runGql()).toEqual({ unread: "GitHub returned incomplete (null) nodes" });
  });
});
