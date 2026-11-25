import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { mockReadWorkflowElsewhere, mockResolveWorkflowId } = vi.hoisted(() => ({
  mockReadWorkflowElsewhere: vi.fn(),
  mockResolveWorkflowId: vi.fn(),
}));
vi.mock("../../github/workflow-elsewhere-read.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../github/workflow-elsewhere-read.mts")>()),
  readWorkflowElsewhere: mockReadWorkflowElsewhere,
  resolveWorkflowId: mockResolveWorkflowId,
}));

import { attachWorkflowElsewhere } from "./workflow-elsewhere.mts";
import type { AgentCheck, ShepherdReport, TriagedCheck } from "../../types.mts";

const REPO = { owner: "owner", name: "repo" };
const REPORT = {
  pr: 42,
  headSha: "abc123",
  mergeQueue: {
    enabled: true,
    inQueue: false,
    latestRemoval: { reason: "failed_checks", createdAtUnix: 1_715_799_000, beforeCommitOid: "q1" },
  },
} as unknown as ShepherdReport;

function makeCheck(overrides: Partial<TriagedCheck> = {}): TriagedCheck {
  return {
    name: "test (3/4)",
    status: "COMPLETED",
    conclusion: "FAILURE",
    source: "check_run",
    detailsUrl: "https://github.com/owner/repo/actions/runs/100",
    event: "merge_group",
    runId: "100",
    workflowId: "7001",
    workflowName: "CI",
    scope: "merge_group",
    commitOid: "q1",
    category: "failing",
    ...overrides,
  };
}

describe("attachWorkflowElsewhere", () => {
  let stateDir: string;
  let stateKey: { owner: string; repo: string; pr: number };

  beforeEach(() => {
    vi.clearAllMocks();
    stateDir = mkdtempSync(join(tmpdir(), "wf-elsewhere-orch-"));
    vi.stubEnv("PR_SHEPHERD_STATE_DIR", stateDir);
    stateKey = { owner: "owner", repo: "repo", pr: 42 };
    return () => {
      vi.unstubAllEnvs();
      rmSync(stateDir, { recursive: true, force: true });
    };
  });

  it("skips when compareWindowHours is 0, removal is missing, or check is external/non-queue", async () => {
    const ext = makeCheck({
      runId: null,
      workflowId: undefined,
      workflowName: undefined,
      source: "status_context",
    });
    const other = makeCheck({ scope: undefined, commitOid: undefined });
    const thirdParty = makeCheck({ workflowId: undefined, workflowName: undefined });
    const res0 = await attachWorkflowElsewhere({
      checks: [makeCheck() as unknown as AgentCheck],
      rawFailing: [makeCheck()],
      report: REPORT,
      repo: REPO,
      stateKey,
      ejectionCommit: "q1",
      compareWindowHours: 0,
    });
    expect(res0[0]!.elsewhere).toBeUndefined();
    expect(mockReadWorkflowElsewhere).not.toHaveBeenCalled();

    const resMixed = await attachWorkflowElsewhere({
      checks: [ext, other, thirdParty] as unknown as AgentCheck[],
      rawFailing: [ext, other, thirdParty],
      report: REPORT,
      repo: REPO,
      stateKey,
      ejectionCommit: "q1",
      compareWindowHours: 6,
    });
    expect(
      resMixed.every((c) => c.elsewhere === undefined && c.elsewhereUnread === undefined),
    ).toBe(true);
    expect(mockReadWorkflowElsewhere).not.toHaveBeenCalled();
  });

  it("caches per removal, fetches once per workflow across shards, and stamps per-check sameJob", async () => {
    const shard1 = makeCheck({ name: "test (1/4)" });
    const shard3 = makeCheck({ name: "test (3/4)" });
    const scope = {
      workflowName: "CI",
      workflowPath: ".github/workflows/ci.yml",
      since: "2024-05-15T12:50:00Z",
      defaultBranch: {
        branch: "main",
        commitsRead: 20,
        matched: 1,
        matchedComplete: true,
        shown: 1,
      },
      mergeQueue: { runsRead: 5, matched: 0, matchedComplete: true, shown: 0 },
    };
    mockReadWorkflowElsewhere.mockResolvedValueOnce({
      scope,
      runs: [
        {
          source: "default-branch",
          branch: "main",
          headSha: "a1b2c3d",
          runId: "99",
          conclusion: "FAILURE",
          completedAt: "2024-05-15T16:00:00Z",
          failedJobs: [{ name: "test (3/4)", conclusion: "FAILURE", annotations: [] }],
        },
      ],
    });
    const call = (checks: TriagedCheck[], nowMs?: number) =>
      attachWorkflowElsewhere({
        checks: checks as unknown as AgentCheck[],
        rawFailing: checks,
        report: REPORT,
        repo: REPO,
        stateKey,
        ejectionCommit: "q1",
        compareWindowHours: 6,
        ...(nowMs !== undefined && { nowMs }),
      });
    const first = await call([shard1, shard3], 1_000_000);
    expect(mockReadWorkflowElsewhere).toHaveBeenCalledTimes(1);
    expect(first[0]!.elsewhere?.[0]?.failedJobs[0]?.sameJob).toBeUndefined();
    expect(first[1]!.elsewhere?.[0]?.failedJobs[0]?.sameJob).toBe(true);
    expect(first[0]!.elsewhereScope).toEqual(scope);

    const second = await call([shard3], 1_060_000);
    expect(mockReadWorkflowElsewhere).toHaveBeenCalledTimes(1);
    expect(second[0]!.elsewhere?.[0]?.failedJobs[0]?.sameJob).toBe(true);

    mockReadWorkflowElsewhere.mockResolvedValueOnce({ runs: [], scope });
    const expired = await call([shard3], 1_000_000 + 6 * 60 * 1000);
    expect(mockReadWorkflowElsewhere).toHaveBeenCalledTimes(2);
    expect(expired[0]!.elsewhere).toEqual([]);
  });

  it("never caches unread/incomplete reads and resolves missing workflowId via REST", async () => {
    const noWf = makeCheck({ workflowId: undefined });
    mockResolveWorkflowId.mockResolvedValueOnce("7001");
    mockReadWorkflowElsewhere.mockResolvedValueOnce({
      unread: "GitHub returned incomplete (null) nodes",
    });
    const first = await attachWorkflowElsewhere({
      checks: [noWf] as unknown as AgentCheck[],
      rawFailing: [noWf],
      report: REPORT,
      repo: REPO,
      stateKey,
      ejectionCommit: "q1",
      compareWindowHours: 6,
    });
    expect(first[0]!.elsewhereUnread).toBe("GitHub returned incomplete (null) nodes");

    mockResolveWorkflowId.mockResolvedValueOnce("7001");
    mockReadWorkflowElsewhere.mockResolvedValueOnce({
      runs: [],
      scope: {
        since: "2024-05-15T12:50:00Z",
        defaultBranch: {
          branch: "main",
          commitsRead: 0,
          matched: 0,
          matchedComplete: true,
          shown: 0,
        },
        mergeQueue: { runsRead: 0, matched: 0, matchedComplete: true, shown: 0 },
      },
    });
    const second = await attachWorkflowElsewhere({
      checks: [noWf] as unknown as AgentCheck[],
      rawFailing: [noWf],
      report: REPORT,
      repo: REPO,
      stateKey,
      ejectionCommit: "q1",
      compareWindowHours: 6,
    });
    expect(mockReadWorkflowElsewhere).toHaveBeenCalledTimes(2);
    expect(second[0]!.elsewhere).toEqual([]);
  });
});
