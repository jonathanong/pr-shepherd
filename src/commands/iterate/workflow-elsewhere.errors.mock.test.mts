import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { mockReadWorkflowElsewhere, mockResolveWorkflowId } = vi.hoisted(() => ({
  mockReadWorkflowElsewhere: vi.fn(),
  mockResolveWorkflowId: vi.fn(),
}));
vi.mock("../../github/workflow-elsewhere-read.mts", () => ({
  readWorkflowElsewhere: mockReadWorkflowElsewhere,
  resolveWorkflowId: mockResolveWorkflowId,
}));

import { attachWorkflowElsewhere } from "./workflow-elsewhere.mts";
import { GitHubRequestError } from "../../github/errors.mts";
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

const makeCheck = (overrides: Partial<TriagedCheck> = {}): TriagedCheck => ({
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
});

describe("attachWorkflowElsewhere errors and rate limits", () => {
  let stateDir: string;
  let stateKey: { owner: string; repo: string; pr: number };

  beforeEach(() => {
    vi.clearAllMocks();
    stateDir = mkdtempSync(join(tmpdir(), "wf-elsewhere-err-"));
    process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
    stateKey = { owner: "owner", repo: "repo", pr: 42 };
    return () => rmSync(stateDir, { recursive: true, force: true });
  });

  const run = (check: TriagedCheck) =>
    attachWorkflowElsewhere({
      checks: [check as unknown as AgentCheck],
      rawFailing: [check],
      report: REPORT,
      repo: REPO,
      stateKey,
      ejectionCommit: "q1",
      compareWindowHours: 6,
    });

  it("surfaces HTTP, missing workflow ID, and generic/long errors as elsewhereUnread", async () => {
    mockReadWorkflowElsewhere.mockRejectedValueOnce(
      new GitHubRequestError("boom", { status: 502 }),
    );
    expect((await run(makeCheck()))[0]!.elsewhereUnread).toBe("HTTP 502");

    mockReadWorkflowElsewhere.mockRejectedValueOnce(new Error(""));
    expect((await run(makeCheck()))[0]!.elsewhereUnread).toBe("request failed");

    mockReadWorkflowElsewhere.mockRejectedValueOnce("plain string failure");
    expect((await run(makeCheck()))[0]!.elsewhereUnread).toBe("plain string failure");

    mockReadWorkflowElsewhere.mockRejectedValueOnce(new Error("x".repeat(200)));
    const longErr = (await run(makeCheck()))[0]!.elsewhereUnread!;
    expect(longErr.length).toBe(120);
    expect(longErr.endsWith("…")).toBe(true);

    const noWf = makeCheck({ workflowId: undefined });
    mockResolveWorkflowId.mockResolvedValueOnce(undefined);
    expect((await run(noWf))[0]!.elsewhereUnread).toBe("workflow ID unavailable");

    mockResolveWorkflowId.mockRejectedValueOnce(new Error("network down"));
    expect((await run(noWf))[0]!.elsewhereUnread).toBe("network down");
  });

  it("rethrows primary rate-limit errors from read or workflow-ID resolution", async () => {
    const rateErr = new GitHubRequestError("rate limit", {
      status: 403,
      rateLimit: { limit: 5000, remaining: 0, resetAt: Math.floor(Date.now() / 1000) + 60 },
    });
    mockReadWorkflowElsewhere.mockRejectedValueOnce(rateErr);
    await expect(run(makeCheck())).rejects.toBe(rateErr);

    mockResolveWorkflowId.mockRejectedValueOnce(rateErr);
    await expect(run(makeCheck({ workflowId: undefined }))).rejects.toBe(rateErr);
  });
});
