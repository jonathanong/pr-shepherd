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

  it("reads one page past the created_at cutoff for re-runs and reports truncation when budget exhausts", async () => {
    const ownRun = (id: number, ts: string) => ({
      id,
      head_sha: `s${id}`,
      head_branch: "gh-readonly-queue/main/pr-42-aaa",
      event: "merge_group",
      status: "completed",
      conclusion: "failure",
      created_at: ts,
    });
    // Page 1 crosses created_at < windowStartMs; page 2 is still read and picks up an older run
    // that was re-run inside the window, then stops cleanly.
    mockRest.mockImplementation((_m: string, p: string) => {
      if (p === "/repos/owner/repo") return Promise.resolve({ default_branch: "main" });
      if (p.includes("branch=main")) return Promise.resolve({ workflow_runs: [] });
      if (p.includes("&page=2")) {
        return Promise.resolve({
          workflow_runs: Array.from({ length: 30 }, (_, i) =>
            i === 0
              ? {
                  id: 909,
                  head_sha: "rerund1",
                  head_branch: "gh-readonly-queue/main/pr-812-rerund1",
                  event: "merge_group",
                  status: "completed",
                  conclusion: "success",
                  created_at: "2024-05-15T09:00:00Z",
                  updated_at: "2024-05-15T14:20:00Z",
                }
              : ownRun(i + 31, "2024-05-15T08:00:00Z"),
          ),
        });
      }
      return Promise.resolve({
        workflow_runs: Array.from({ length: 30 }, (_, i) =>
          ownRun(i + 1, i === 29 ? "2024-05-15T10:00:00Z" : "2024-05-15T14:00:00Z"),
        ),
      });
    });
    const rerunRes = await runRest();
    expect("runs" in rerunRes && rerunRes.runs.map((r) => r.runId)).toEqual(["909"]);
    expect("scope" in rerunRes && rerunRes.scope.mergeQueue.matchedComplete).toBe(true);

    // Page 1 alone fills the 3-candidate target on a full page -> matchedComplete is false.
    mockRest.mockImplementation((_m: string, p: string) => {
      if (p === "/repos/owner/repo") return Promise.resolve({ default_branch: "main" });
      if (p.includes("branch=main")) return Promise.resolve({ workflow_runs: [] });
      return Promise.resolve({
        workflow_runs: Array.from({ length: 30 }, (_, i) => ({
          id: 500 + i,
          head_sha: `sha${i}`,
          head_branch: `gh-readonly-queue/main/pr-${700 + i}-aaa`,
          event: "merge_group",
          status: "completed",
          conclusion: "success",
          created_at: "2024-05-15T14:00:00Z",
        })),
      });
    });
    const earlyStop = await runRest();
    expect("scope" in earlyStop && earlyStop.scope.mergeQueue).toEqual({
      runsRead: 30,
      matched: 30,
      matchedComplete: false,
      shown: 3,
    });

    // Exhausting all 3 pages before reading one page past the cutoff reports truncation.
    mockRest.mockImplementation((_m: string, p: string) => {
      if (p === "/repos/owner/repo") return Promise.resolve({ default_branch: "main" });
      if (p.includes("branch=main")) return Promise.resolve({ workflow_runs: [] });
      return Promise.resolve({
        workflow_runs: Array.from({ length: 30 }, (_, i) =>
          ownRun(
            i + 1,
            p.includes("&page=3") && i === 29 ? "2024-05-15T10:00:00Z" : "2024-05-15T14:00:00Z",
          ),
        ),
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
