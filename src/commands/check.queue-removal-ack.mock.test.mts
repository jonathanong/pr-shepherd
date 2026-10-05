import { describe, expect, it, vi } from "vitest";
import {
  BASE_OPTS,
  makeBatchData,
  mockFetchPrBatch,
  registerHooks,
} from "../../test-helpers/commands/check.test-support.mts";
import { readQueueRemovalAcknowledgment } from "../state/queue-removal-ack.mts";
import { runCheck } from "./check.mts";

vi.mock("../state/queue-removal-ack.mts", async (importOriginal) => ({
  ...(await importOriginal()),
  readQueueRemovalAcknowledgment: vi.fn(),
}));
vi.mock("../github/merge-target-rules.mts", () => ({
  loadMergeTargetStatus: vi.fn().mockResolvedValue({ contexts: [] }),
  loadBaseBehindBy: vi.fn(),
}));
registerHooks();

const ack = {
  headSha: "abc123",
  queueCommitOid: "queue-commit",
  removedAtUnix: 1_700_000_000,
};

function batch() {
  return makeBatchData({
    stack: { number: 7, size: 1, position: 1, baseRefName: "main" },
    isMergeQueueEnabled: true,
    latestMergeQueueRemoval: {
      reason: "failed_checks",
      createdAtUnix: ack.removedAtUnix,
      beforeCommitOid: ack.queueCommitOid,
      beforeCommitParentOids: [ack.headSha],
    },
    removedMergeQueueChecks: [
      {
        name: "queue-tests",
        status: "COMPLETED",
        conclusion: "FAILURE",
        detailsUrl: "https://github.com/owner/repo/actions/runs/123",
        event: "merge_group",
        runId: "123",
        scope: "merge_group",
        commitOid: ack.queueCommitOid,
      },
    ],
  });
}

describe("runCheck — acknowledged stack queue removal", () => {
  it("rechecks source CI while retaining the acknowledged removal", async () => {
    vi.mocked(readQueueRemovalAcknowledgment).mockResolvedValue(ack);
    mockFetchPrBatch.mockResolvedValue({ data: batch() });
    const report = await runCheck(BASE_OPTS);
    expect(report.checks.failing).toEqual([]);
    expect(report.checks.passing).toHaveLength(1);
    expect(report.mergeQueue).toMatchObject({
      removalAcknowledged: true,
      latestRemoval: { reason: "failed_checks" },
    });
  });

  it.each(["head", "commit", "time", "manual", "non-stack"])(
    "does not suppress %s mismatch",
    async (state) => {
      const data = batch();
      const stored = { ...ack };
      if (state === "head") stored.headSha = "old-head";
      if (state === "commit") stored.queueCommitOid = "old-queue";
      if (state === "time") stored.removedAtUnix -= 1;
      if (state === "manual") data.latestMergeQueueRemoval!.reason = "MANUAL";
      if (state === "non-stack") delete data.stack;
      vi.mocked(readQueueRemovalAcknowledgment).mockResolvedValue(stored);
      mockFetchPrBatch.mockResolvedValue({ data });
      const report = await runCheck(BASE_OPTS);
      expect(report.checks.failing.map((check) => check.name)).toContain("queue-tests");
      expect(report.mergeQueue?.removalAcknowledged).toBeUndefined();
    },
  );

  it("preserves source failures after acknowledgment", async () => {
    const data = batch();
    data.checks[0]!.conclusion = "FAILURE";
    vi.mocked(readQueueRemovalAcknowledgment).mockResolvedValue(ack);
    mockFetchPrBatch.mockResolvedValue({ data });
    const report = await runCheck(BASE_OPTS);
    expect(report.checks.failing.map((check) => check.name)).toEqual([data.checks[0]!.name]);
  });
});
