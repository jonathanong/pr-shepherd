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
const failedMainRun = {
  id: 801,
  head_sha: "aaaaaaa",
  event: "push",
  status: "completed",
  conclusion: "failure",
  created_at: "2024-05-15T14:00:00Z",
};

describe("workflow-elsewhere-rest errors and pagination", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports unread on malformed repo, run, job, or annotation payloads", async () => {
    mockRest.mockResolvedValueOnce({});
    expect(await runRest()).toEqual({ unread: "default branch unavailable" });

    mockRest
      .mockResolvedValueOnce({ default_branch: "main" })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ workflow_runs: [] });
    expect(await runRest()).toEqual({ unread: "malformed workflow runs response" });

    mockRest
      .mockResolvedValueOnce({ default_branch: "main" })
      .mockResolvedValueOnce({ workflow_runs: [] })
      .mockResolvedValueOnce({});
    expect(await runRest()).toEqual({ unread: "malformed workflow runs response" });

    mockRest.mockImplementation((_m: string, p: string) => {
      if (p === "/repos/owner/repo") return Promise.resolve({ default_branch: "main" });
      if (p.includes("branch=main")) return Promise.resolve({ workflow_runs: [failedMainRun] });
      if (p.includes("event=merge_group")) return Promise.resolve({ workflow_runs: [] });
      return Promise.resolve({});
    });
    expect(await runRest()).toEqual({ unread: "malformed workflow jobs response" });

    mockRest.mockImplementation((_m: string, p: string) => {
      if (p === "/repos/owner/repo") return Promise.resolve({ default_branch: "main" });
      if (p.includes("branch=main")) return Promise.resolve({ workflow_runs: [failedMainRun] });
      if (p.includes("event=merge_group")) return Promise.resolve({ workflow_runs: [] });
      if (p.includes("/jobs"))
        return Promise.resolve({ jobs: [{ id: 1, name: "j", conclusion: "failure" }] });
      return Promise.resolve(null);
    });
    expect(await runRest()).toEqual({ unread: "malformed check-run annotations response" });
  });

  it("stops run pagination at the window edge and reports truncation when budget exhausts", async () => {
    const ownRun = (id: number, ts: string) => ({
      id,
      head_sha: `s${id}`,
      head_branch: "gh-readonly-queue/main/pr-42-aaa",
      event: "merge_group",
      status: "completed",
      conclusion: "failure",
      created_at: ts,
    });
    mockRest.mockImplementation((_m: string, p: string) => {
      if (p === "/repos/owner/repo") return Promise.resolve({ default_branch: "main" });
      if (p.includes("branch=main")) return Promise.resolve({ workflow_runs: [] });
      return Promise.resolve({
        workflow_runs: Array.from({ length: 30 }, (_, i) =>
          ownRun(i + 1, i === 29 ? "2024-05-15T10:00:00Z" : "2024-05-15T14:00:00Z"),
        ),
      });
    });
    expect(await runRest()).toEqual({ runs: [], since: "2024-05-15T11:30:00Z" });

    mockRest.mockImplementation((_m: string, p: string) => {
      if (p === "/repos/owner/repo") return Promise.resolve({ default_branch: "main" });
      if (p.includes("branch=main")) return Promise.resolve({ workflow_runs: [] });
      return Promise.resolve({
        workflow_runs: Array.from({ length: 30 }, (_, i) => ownRun(i + 1, "2024-05-15T14:00:00Z")),
      });
    });
    expect(await runRest()).toEqual({ unread: "workflow runs pagination truncated" });
  });

  it("reports unread when job pagination exhausts 3 pages without closing the list", async () => {
    const mockFullJobPages = (firstConclusion: string) => {
      mockRest.mockImplementation((_m: string, p: string) => {
        if (p === "/repos/owner/repo") return Promise.resolve({ default_branch: "main" });
        if (p.includes("branch=main")) return Promise.resolve({ workflow_runs: [failedMainRun] });
        if (p.includes("event=merge_group")) return Promise.resolve({ workflow_runs: [] });
        return Promise.resolve({
          jobs: Array.from({ length: 100 }, (_, i) => ({
            id: i + 1,
            name: `job-${i}`,
            conclusion: i === 0 && p.includes("page=1") ? firstConclusion : "success",
          })),
        });
      });
    };
    mockFullJobPages("success");
    expect(await runRest()).toEqual({ unread: "workflow jobs pagination truncated" });
    mockFullJobPages("failure");
    expect(await runRest()).toEqual({ unread: "workflow jobs pagination truncated" });
  });
});
