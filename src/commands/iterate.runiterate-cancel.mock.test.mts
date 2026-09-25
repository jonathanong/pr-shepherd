/* eslint-disable max-lines */
import { beforeEach, describe, it, expect, vi } from "vitest";

const {
  mockClearReadyReceipt,
  mockFetchPollSummary,
  mockFetchRawSummaryPr,
  mockFingerprintRawSummaryPr,
  mockIsReadyReceiptCurrent,
  mockReadReadyReceipt,
  mockReadStackTopology,
  mockSummarizePollSummaryPr,
  mockWriteReadyReceipt,
} = vi.hoisted(() => ({
  mockClearReadyReceipt: vi.fn(),
  mockFetchPollSummary: vi.fn(),
  mockFetchRawSummaryPr: vi.fn(),
  mockFingerprintRawSummaryPr: vi.fn(),
  mockIsReadyReceiptCurrent: vi.fn(),
  mockReadReadyReceipt: vi.fn(),
  mockReadStackTopology: vi.fn(),
  mockSummarizePollSummaryPr: vi.fn(),
  mockWriteReadyReceipt: vi.fn(),
}));

vi.mock("../../src/github/poll-summary.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/github/poll-summary.mts")>()),
  fetchPollSummary: mockFetchPollSummary,
  fetchRawSummaryPr: mockFetchRawSummaryPr,
}));
vi.mock("../../src/github/stack-read.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/github/stack-read.mts")>()),
  readStackTopology: mockReadStackTopology,
}));
vi.mock("../../src/github/poll-summary-fingerprint.mts", () => ({
  fingerprintRawSummaryPr: mockFingerprintRawSummaryPr,
}));
vi.mock("../../src/github/poll-summary-projector.mts", () => ({
  summarizePollSummaryPr: mockSummarizePollSummaryPr,
}));
vi.mock("../../src/state/ready-receipts.mts", () => ({
  clearReadyReceipt: mockClearReadyReceipt,
  isReadyReceiptCurrent: mockIsReadyReceiptCurrent,
  readReadyReceipt: mockReadReadyReceipt,
  writeReadyReceipt: mockWriteReadyReceipt,
}));
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockClearReadyDelay,
  mockClearStallState,
  mockReadStallState,
  mockUpdateReadyDelay,
  mockWriteStallState,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

/**
 * Three-layer stack topology around PR #42. The parent head is always
 * `parent-current`; `childBaseRefOid` is the base PR #42 recorded.
 */
function stackTopology(childBaseRefOid: string) {
  const member = (
    number: number,
    headRefName: string,
    baseRefName: string,
    baseRefOid: string,
  ) => ({
    number,
    state: "OPEN",
    headRefName,
    headRefOid: headRefName === "feature-parent" ? "parent-current" : `${headRefName}-head`,
    baseRefName,
    baseRefOid,
  });
  return {
    stackNumber: 7,
    stackSize: 3,
    viewerCanAdminister: false,
    ordered: [
      member(41, "feature-parent", "main", "main-base"),
      member(42, "feature-child", "feature-parent", childBaseRefOid),
      member(43, "feature-top", "feature-child", "feature-child-head"),
    ],
  };
}

const rawReadySnapshot = {
  state: "OPEN",
  isDraft: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  headRefOid: "head-1",
  baseRefOid: "base-1",
};
const existingReceipt = {
  version: 1 as const,
  owner: "owner",
  repo: "repo",
  pr: 42,
  headRefOid: "head-1",
  baseRefOid: "base-1",
  status: "READY" as const,
  isDraft: false as const,
  readinessFingerprint: "fingerprint-1",
  recordedAtUnix: 1_700_000_000,
};

function stackRequirements() {
  return {
    approvals: { current: 1, requiredCount: 1 },
    conversationsResolved: { resolved: true, unresolvedCount: 0, required: true },
    stack: { number: 7, size: 2, position: 1, baseRefName: "main" },
  };
}

beforeEach(() => {
  mockClearReadyReceipt.mockReset();
  mockFetchPollSummary.mockReset();
  mockFetchRawSummaryPr.mockReset();
  mockFingerprintRawSummaryPr.mockReset();
  mockIsReadyReceiptCurrent.mockReset();
  mockReadReadyReceipt.mockReset();
  mockReadStackTopology.mockReset();
  mockSummarizePollSummaryPr.mockReset();
  mockWriteReadyReceipt.mockReset();
  mockReadReadyReceipt.mockResolvedValue(null);
  mockFetchPollSummary.mockResolvedValue({ prs: [], stackAncestry: [] });
  mockReadStackTopology.mockResolvedValue(stackTopology("parent-current"));
  mockFetchRawSummaryPr.mockResolvedValue(rawReadySnapshot);
  mockFingerprintRawSummaryPr.mockReturnValue("fingerprint-1");
  mockIsReadyReceiptCurrent.mockReturnValue(true);
  mockSummarizePollSummaryPr.mockResolvedValue({ checks: {}, review: {} });
  mockWriteReadyReceipt.mockResolvedValue(undefined);
});

describe("runIterate — cancel", () => {
  it("returns action: cancel when shouldCancel is true", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("cancel");
    expect(result.shouldCancel).toBe(true);
    expect(result.remainingSeconds).toBe(0);
  });

  it("does not cancel from a stale ready-delay marker when READY has fix_code work", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        firstLookSummaries: [
          {
            id: "review-1",
            author: "reviewer-bot",
            authorType: "Bot",
            body: "Looks good overall.",
          },
        ],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(mockUpdateReadyDelay).toHaveBeenCalledWith(42, false, 600, "owner", "repo", {
      retainElapsed: false,
      alreadyElapsed: false,
    });
    expect(result.action).toBe("fix_code");
    expect(result.shouldCancel).toBe(false);
  });

  it("resets ready-delay when READY has pending comment minimization", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        comments: { actionable: [], firstLook: [], minimizeIds: ["comment-1"] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(mockUpdateReadyDelay).toHaveBeenCalledWith(42, false, 600, "owner", "repo", {
      retainElapsed: false,
      alreadyElapsed: false,
    });
    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.reviewSummaryIds).toHaveLength(0);
      expect(result.fix.resolveCommand.hasMutations).toBe(true);
    }
  });

  it("does not cancel a draft when auto mark-ready is disabled", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        mergeStatus: { ...makeReport().mergeStatus, isDraft: true, status: "DRAFT" },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts({ noAutoMarkReady: true }));

    expect(result.action).toBe("wait");
    expect(result.shouldCancel).toBe(false);
    expect(mockUpdateReadyDelay).toHaveBeenCalledWith(42, false, 600, "owner", "repo", {
      retainElapsed: false,
      alreadyElapsed: false,
    });
  });

  it("writes a receipt only after a fresh matching READY snapshot", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "head-1",
        baseRefOid: "base-1",
        mergeStatus: { ...makeReport().mergeStatus, mergeRequirements: stackRequirements() },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("cancel");
    expect(mockFetchRawSummaryPr).toHaveBeenCalledWith(42, { owner: "owner", name: "repo" });
    expect(mockSummarizePollSummaryPr).toHaveBeenCalledWith(
      rawReadySnapshot,
      { owner: "owner", name: "repo" },
      { stackPrNumber: 42 },
    );
    expect(mockWriteReadyReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "owner",
        repo: "repo",
        pr: 42,
        headRefOid: "head-1",
        baseRefOid: "base-1",
        readinessFingerprint: "fingerprint-1",
      }),
    );
    expect(mockUpdateReadyDelay).toHaveBeenCalledWith(42, true, 600, "owner", "repo", {
      retainElapsed: true,
      alreadyElapsed: false,
    });
    expect(mockClearReadyDelay).toHaveBeenCalledWith(42, "owner", "repo");
  });

  it("writes the receipt before routing a ready stacked merge request", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "head-1",
        baseRefOid: "base-1",
        mergeStatus: { ...makeReport().mergeStatus, mergeRequirements: stackRequirements() },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts({ merge: true }));

    expect(mockWriteReadyReceipt).toHaveBeenCalledTimes(1);
    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.instructions.join("\n")).toContain(
        "pr-shepherd --stack https://github.com/owner/repo/pull/42 --until-terminal --merge",
      );
    }
  });

  it("does not route a stacked merge request when its receipt cannot be persisted", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "head-1",
        baseRefOid: "base-1",
        mergeStatus: { ...makeReport().mergeStatus, mergeRequirements: stackRequirements() },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });
    mockFetchRawSummaryPr.mockRejectedValue(new Error("summary unavailable"));

    const result = await runIterate(makeOpts({ merge: true }));

    expect(result).toMatchObject({ action: "wait", shouldCancel: false });
    expect(result.action).not.toBe("fix_code");
  });

  it("acknowledges a current queue removal in the fresh receipt", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "head-1",
        baseRefOid: "base-1",
        mergeStatus: { ...makeReport().mergeStatus, mergeRequirements: stackRequirements() },
      }),
    );
    mockFetchRawSummaryPr.mockResolvedValue({
      ...rawReadySnapshot,
      isInMergeQueue: false,
      mergeQueueRemovals: {
        nodes: [
          {
            id: "removal-1",
            createdAt: "2026-09-20T10:00:00Z",
            reason: "FAILED",
            actor: null,
            beforeCommit: { oid: "queue-1", parents: { nodes: [{ oid: "head-1" }] } },
          },
        ],
      },
    });
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    await runIterate(makeOpts());

    expect(mockWriteReadyReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ acknowledgedQueueRemovalId: "removal-1" }),
    );
  });

  it("keeps a non-stack cancel without receipt I/O", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ status: "READY", headSha: "head-1" }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });
    const result = await runIterate(makeOpts());

    expect(result.action).toBe("cancel");
    expect(mockReadReadyReceipt).not.toHaveBeenCalled();
    expect(mockClearReadyReceipt).not.toHaveBeenCalled();
    expect(mockFetchRawSummaryPr).not.toHaveBeenCalled();
    expect(mockWriteReadyReceipt).not.toHaveBeenCalled();
    expect(mockClearReadyDelay).not.toHaveBeenCalled();
  });

  it("fails closed to WAIT when a stack receipt cannot be persisted", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "head-1",
        baseRefOid: "base-1",
        mergeStatus: { ...makeReport().mergeStatus, mergeRequirements: stackRequirements() },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });
    mockFetchRawSummaryPr.mockRejectedValue(new Error("summary unavailable"));

    const result = await runIterate(makeOpts());

    // The elapsed marker stays, so the next tick retries the receipt at once
    // instead of restarting the whole ready-delay.
    expect(result).toMatchObject({
      action: "wait",
      shouldCancel: false,
      remainingSeconds: 0,
      log: expect.stringContaining("readiness receipt"),
    });
    expect(mockClearReadyDelay).not.toHaveBeenCalled();
  });

  it("fails closed before fetching when the current stack report lacks its base OID", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "head-1",
        mergeStatus: { ...makeReport().mergeStatus, mergeRequirements: stackRequirements() },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts());

    expect(result).toMatchObject({ action: "wait", shouldCancel: false });
    expect(mockFetchRawSummaryPr).not.toHaveBeenCalled();
  });

  it("fails closed when the fresh stack snapshot has no fingerprint", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "head-1",
        baseRefOid: "base-1",
        mergeStatus: { ...makeReport().mergeStatus, mergeRequirements: stackRequirements() },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });
    mockFingerprintRawSummaryPr.mockReturnValue(null);

    const result = await runIterate(makeOpts());

    expect(result).toMatchObject({ action: "wait", shouldCancel: false });
    expect(mockSummarizePollSummaryPr).not.toHaveBeenCalled();
    expect(mockWriteReadyReceipt).not.toHaveBeenCalled();
  });

  it("keeps receipt failures in the stall guard until the timeout", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "head-1",
        baseRefOid: "base-1",
        mergeStatus: { ...makeReport().mergeStatus, mergeRequirements: stackRequirements() },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });
    mockFetchRawSummaryPr.mockRejectedValue(new Error("summary unavailable"));
    mockReadStallState.mockResolvedValue({ ok: true, state: null });

    const first = await runIterate(makeOpts({ stallTimeoutSeconds: 600 }));

    expect(first).toMatchObject({ action: "wait", shouldCancel: false });
    expect(mockClearReadyReceipt).not.toHaveBeenCalled();
    expect(mockWriteStallState).toHaveBeenCalledOnce();
    const fingerprint = (mockWriteStallState.mock.calls[0]![1] as { fingerprint: string })
      .fingerprint;

    mockReadStallState.mockResolvedValue({
      ok: true,
      state: {
        fingerprint,
        firstSeenAt: Math.floor(Date.now() / 1000) - 601,
      },
    });

    const second = await runIterate(makeOpts({ stallTimeoutSeconds: 600 }));

    expect(second.action).toBe("escalate");
    if (second.action === "escalate") {
      expect(second.escalate.triggers).toContain("stall-timeout");
    }
    expect(mockClearStallState).not.toHaveBeenCalled();
  });

  it("does not write a receipt when fresh compact evidence has failing checks", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "head-1",
        baseRefOid: "base-1",
        mergeStatus: { ...makeReport().mergeStatus, mergeRequirements: stackRequirements() },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });
    mockSummarizePollSummaryPr.mockResolvedValue({ checks: { failing: 1 }, review: {} });

    const result = await runIterate(makeOpts());

    expect(result).toMatchObject({ action: "wait", shouldCancel: false });
    expect(mockWriteReadyReceipt).not.toHaveBeenCalled();
  });

  it("clears a receipt immediately when report state has actionable work", async () => {
    mockReadReadyReceipt.mockResolvedValue(existingReceipt);
    mockRunCheck.mockResolvedValue(
      makeReport({
        comments: { actionable: [], firstLook: [], minimizeIds: ["comment-1"] },
        mergeStatus: { ...makeReport().mergeStatus, mergeRequirements: stackRequirements() },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    await runIterate(makeOpts());

    expect(mockClearReadyReceipt).toHaveBeenCalledWith({ owner: "owner", repo: "repo", pr: 42 });
    expect(mockFetchRawSummaryPr).not.toHaveBeenCalled();
  });

  it("retains a matching receipt while merge-group work keeps a PR queued", async () => {
    mockReadReadyReceipt.mockResolvedValue(existingReceipt);
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "PENDING",
        headSha: "head-1",
        baseRefOid: "base-1",
        comments: { actionable: [], firstLook: [], minimizeIds: ["comment-1"] },
        mergeQueue: { enabled: true, inQueue: true },
        mergeStatus: { ...makeReport().mergeStatus, mergeRequirements: stackRequirements() },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    await runIterate(makeOpts({ merge: true }));

    expect(mockFetchRawSummaryPr).toHaveBeenCalled();
    expect(mockIsReadyReceiptCurrent).toHaveBeenCalled();
    expect(mockClearReadyReceipt).not.toHaveBeenCalled();
  });

  it("retains a queued receipt when a preceding queue entry advances the base", async () => {
    mockReadReadyReceipt.mockResolvedValue(existingReceipt);
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "PENDING",
        headSha: "head-1",
        baseRefOid: "base-2",
        mergeQueue: { enabled: true, inQueue: true },
        mergeStatus: { ...makeReport().mergeStatus, mergeRequirements: stackRequirements() },
      }),
    );
    mockFetchRawSummaryPr.mockResolvedValue({
      ...rawReadySnapshot,
      baseRefOid: "base-2",
      isInMergeQueue: true,
    });
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    await runIterate(makeOpts({ merge: true }));

    expect(mockFingerprintRawSummaryPr).toHaveBeenCalledWith(
      expect.objectContaining({ baseRefOid: "base-1", isInMergeQueue: true }),
    );
    expect(mockIsReadyReceiptCurrent).toHaveBeenCalledWith(
      existingReceipt,
      expect.objectContaining({ baseRefOid: "base-1" }),
    );
    expect(mockClearReadyReceipt).not.toHaveBeenCalled();
  });

  it("clears a receipt when the fresh fingerprint no longer matches", async () => {
    mockReadReadyReceipt.mockResolvedValue(existingReceipt);
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "head-1",
        baseRefOid: "base-1",
        mergeStatus: { ...makeReport().mergeStatus, mergeRequirements: stackRequirements() },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });
    mockFingerprintRawSummaryPr.mockReturnValue("fingerprint-2");
    mockIsReadyReceiptCurrent.mockReturnValue(false);

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("wait");
    expect(mockClearReadyReceipt).toHaveBeenCalledWith({ owner: "owner", repo: "repo", pr: 42 });
  });

  it("clears a receipt when the current snapshot cannot produce a fingerprint", async () => {
    mockReadReadyReceipt.mockResolvedValue(existingReceipt);
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "head-1",
        baseRefOid: "base-1",
        mergeStatus: { ...makeReport().mergeStatus, mergeRequirements: stackRequirements() },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });
    mockFingerprintRawSummaryPr.mockReturnValue(null);

    await runIterate(makeOpts());

    expect(mockClearReadyReceipt).toHaveBeenCalledWith({ owner: "owner", repo: "repo", pr: 42 });
  });

  it("clears a receipt when current-state verification throws", async () => {
    mockReadReadyReceipt.mockResolvedValue(existingReceipt);
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "head-1",
        baseRefOid: "base-1",
        mergeStatus: { ...makeReport().mergeStatus, mergeRequirements: stackRequirements() },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });
    mockFetchRawSummaryPr.mockRejectedValue(new Error("summary unavailable"));

    await runIterate(makeOpts());

    expect(mockClearReadyReceipt).toHaveBeenCalledWith({ owner: "owner", repo: "repo", pr: 42 });
  });

  it("routes a verified stale stack boundary through fix_code repair instructions", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "head-1",
        baseRefOid: "base-1",
        mergeStatus: {
          ...makeReport().mergeStatus,
          mergeRequirements: {
            ...stackRequirements(),
            stack: { number: 7, size: 3, position: 2, baseRefName: "feature-parent" },
          },
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    mockReadStackTopology.mockResolvedValue(stackTopology("parent-old"));

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.instructions.join("\n")).toContain("gh stack rebase --upstack --no-trunk");
      expect(result.fix.instructions.join("\n")).toContain("gh stack push");
    }
  });

  it("resets the ready timer before routing a stale stack boundary", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "head-1",
        baseRefOid: "base-1",
        mergeStatus: {
          ...makeReport().mergeStatus,
          mergeRequirements: {
            ...stackRequirements(),
            stack: { number: 7, size: 3, position: 2, baseRefName: "feature-parent" },
          },
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });
    mockReadStackTopology.mockResolvedValue(stackTopology("parent-old"));

    const result = await runIterate(makeOpts());

    expect(mockUpdateReadyDelay).toHaveBeenCalledWith(42, false, 600, "owner", "repo", {
      retainElapsed: true,
      alreadyElapsed: false,
    });
    expect(result.action).toBe("fix_code");
    expect(result.action).not.toBe("cancel");
  });
});
