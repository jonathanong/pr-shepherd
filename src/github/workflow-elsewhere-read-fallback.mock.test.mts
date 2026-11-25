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

import { GitHubRequestError } from "./errors.mts";
import { getGithubTransport, runWithGithubTransport } from "./transport.mts";
import { readWorkflowElsewhere } from "./workflow-elsewhere-read.mts";

const BASE = {
  repo: { owner: "owner", name: "repo" },
  prNumber: 42,
  workflowId: "7001",
  currentRunId: "100",
  currentCommitOid: "q-cur",
  windowStartMs: Date.parse("2024-05-15T11:30:00Z"),
  since: "2024-05-15T11:30:00Z",
};
const emptyHistory = {
  data: { repository: { defaultBranchRef: { name: "main", target: { history: { nodes: [] } } } } },
};

describe("workflow-elsewhere-read transport isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLAUDE_CODE_REMOTE", "");
    return () => vi.unstubAllEnvs();
  });

  it("keeps GraphQL session transport when the REST queue-run listing fails with 5xx", async () => {
    mockGraphql.mockResolvedValueOnce(emptyHistory);
    mockRest.mockRejectedValueOnce(new GitHubRequestError("bad gateway", { status: 502 }));
    const { res, transportAfter } = await runWithGithubTransport("auto", async () => {
      const result = await readWorkflowElsewhere(BASE);
      return { res: result, transportAfter: getGithubTransport() };
    });
    expect(res).toEqual({ unread: "HTTP 502" });
    expect(transportAfter).toBe("graphql");
  });

  it("falls back to REST when the second GraphQL query (QueueCommitCheckSuites) hits a 5xx", async () => {
    mockGraphql
      .mockResolvedValueOnce(emptyHistory)
      .mockRejectedValueOnce(new GitHubRequestError("upstream 502", { status: 502 }));
    mockRest.mockImplementation((_m: string, path: string) => {
      if (path === "/repos/owner/repo") return Promise.resolve({ default_branch: "main" });
      if (path.includes("branch=main")) return Promise.resolve({ workflow_runs: [] });
      if (path.includes("event=merge_group")) {
        return Promise.resolve({
          workflow_runs: [
            {
              id: 601,
              head_sha: "f00ba12",
              head_branch: "gh-readonly-queue/main/pr-812-f00ba12",
              status: "completed",
              conclusion: "failure",
              created_at: "2024-05-15T14:00:00Z",
            },
          ],
        });
      }
      if (path.includes("/jobs")) return Promise.resolve({ jobs: [] });
      throw new Error(`unexpected ${path}`);
    });
    const { res, transportAfter } = await runWithGithubTransport("auto", async () => {
      const result = await readWorkflowElsewhere(BASE);
      return { res: result, transportAfter: getGithubTransport() };
    });
    expect(transportAfter).toBe("rest");
    expect("runs" in res && res.runs).toHaveLength(1);
  });
});
