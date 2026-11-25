import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGraphql, mockRest } = vi.hoisted(() => ({ mockGraphql: vi.fn(), mockRest: vi.fn() }));
vi.mock("./client.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client.mts")>()),
  graphql: mockGraphql,
}));
vi.mock("./http.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./http.mts")>()),
  rest: mockRest,
}));

import { readWorkflowElsewhere } from "./workflow-elsewhere-read.mts";
import { runWithGithubTransport } from "./transport.mts";

const BASE_INPUT = {
  repo: { owner: "owner", name: "repo" },
  prNumber: 42,
  workflowId: "7001",
  currentRunId: "100",
  currentCommitOid: "q-cur",
  windowStartMs: Date.parse("2024-05-15T11:30:00Z"),
  since: "2024-05-15T11:30:00Z",
};
const runRest = () => runWithGithubTransport("rest", () => readWorkflowElsewhere(BASE_INPUT));

describe("workflow-elsewhere-rest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads default branch, queue runs, failed jobs, and annotations in REST transport without GraphQL", async () => {
    mockRest.mockImplementation((_method: string, path: string) => {
      if (path === "/repos/owner/repo") return Promise.resolve({ default_branch: "main" });
      if (path.includes("branch=main")) {
        return Promise.resolve({
          workflow_runs: [
            {
              id: 701,
              name: "CI",
              path: ".github/workflows/ci.yml@refs/heads/main",
              head_sha: "111222333",
              event: "push",
              status: "completed",
              conclusion: "failure",
              run_attempt: 2,
              created_at: "2024-05-15T11:20:00Z",
              updated_at: "2024-05-15T14:01:00Z",
            },
            {
              id: 702,
              head_sha: "444555666",
              event: "push",
              status: "completed",
              conclusion: "success",
              created_at: "2024-05-15T13:00:00Z",
              updated_at: "2024-05-15T13:01:00Z",
            },
          ],
        });
      }
      if (path.includes("event=merge_group")) {
        return Promise.resolve({
          workflow_runs: [
            {
              id: 703,
              head_sha: "777888999",
              head_branch: "gh-readonly-queue/main/pr-812-7778889",
              event: "merge_group",
              status: "completed",
              conclusion: "timed_out",
              created_at: "2024-05-15T14:05:00Z",
            },
          ],
        });
      }
      if (path.includes("/actions/runs/701/attempts/2/jobs")) {
        return Promise.resolve({
          jobs: [
            { id: 91, name: "test (2/4)", conclusion: "failure" },
            { id: 92, name: "lint", conclusion: "success" },
          ],
        });
      }
      if (path.includes("/actions/runs/703/jobs"))
        return Promise.resolve({ jobs: [{ id: 93, name: "test (1/4)", conclusion: "timed_out" }] });
      if (path.includes("/check-runs/91/annotations")) {
        return Promise.resolve([
          { path: "src/x.ts", start_line: 12, message: "bad" },
          { path: "src/y.ts", start_line: 2, message: "two" },
          { path: "src/z.ts", start_line: 3, message: "three" },
          { path: "src/w.ts", start_line: 4, message: "four" },
        ]);
      }
      if (path.includes("/check-runs/93/annotations")) return Promise.resolve([]);
      throw new Error(`unexpected ${path}`);
    });
    const res = await runRest();
    expect(mockGraphql).not.toHaveBeenCalled();
    expect(res).toEqual({
      scope: {
        workflowName: "CI",
        workflowPath: ".github/workflows/ci.yml",
        since: "2024-05-15T11:30:00Z",
        defaultBranch: { branch: "main", runsRead: 2, matched: 2, shown: 2 },
        mergeQueue: { runsRead: 1, matched: 1, shown: 1 },
      },
      runs: [
        {
          source: "merge-queue",
          pr: 812,
          headSha: "7778889",
          runId: "703",
          conclusion: "TIMED_OUT",
          completedAt: "2024-05-15T14:05:00Z",
          failedJobs: [{ name: "test (1/4)", conclusion: "TIMED_OUT", annotations: [] }],
        },
        {
          source: "default-branch",
          branch: "main",
          headSha: "1112223",
          runId: "701",
          conclusion: "FAILURE",
          completedAt: "2024-05-15T14:01:00Z",
          failedJobs: [
            {
              name: "test (2/4)",
              conclusion: "FAILURE",
              annotations: [
                { path: "src/x.ts", line: 12, message: "bad" },
                { path: "src/y.ts", line: 2, message: "two" },
                { path: "src/z.ts", line: 3, message: "three" },
              ],
              moreAnnotations: 1,
            },
          ],
        },
        {
          source: "default-branch",
          branch: "main",
          headSha: "4445556",
          runId: "702",
          conclusion: "SUCCESS",
          completedAt: "2024-05-15T13:01:00Z",
          failedJobs: [],
        },
      ],
    });
  });
});
