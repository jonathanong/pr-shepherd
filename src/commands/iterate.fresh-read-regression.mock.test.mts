import { beforeEach, describe, it, expect, vi } from "vitest";

const { mockFetchRawSummaryPr, mockFingerprintRawSummaryPr, mockSummarizePollSummaryPr } =
  vi.hoisted(() => ({
    mockFetchRawSummaryPr: vi.fn(),
    mockFingerprintRawSummaryPr: vi.fn(),
    mockSummarizePollSummaryPr: vi.fn(),
  }));

vi.mock("../../src/github/poll-summary.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/github/poll-summary.mts")>()),
  fetchRawSummaryPr: mockFetchRawSummaryPr,
}));
vi.mock("../../src/github/poll-summary-fingerprint.mts", () => ({
  fingerprintRawSummaryPr: mockFingerprintRawSummaryPr,
}));
vi.mock("../../src/github/poll-summary-projector.mts", () => ({
  summarizePollSummaryPr: mockSummarizePollSummaryPr,
}));
import {
  registerIterateHooks,
  mockClearReadyDelay,
  mockWriteReadyReceipt,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

// Issue #815: the candidate-READY read taken seconds after a push already shows what the
// check had not seen, and a plain (non-stack) PR used to cancel as READY regardless.
const raw = {
  state: "OPEN",
  isDraft: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  headRefOid: "head-1",
  baseRefOid: "base-1",
};

beforeEach(() => {
  mockRunCheck.mockResolvedValue(
    makeReport({ status: "READY", headSha: "head-1", baseRefOid: "base-1" }),
  );
  mockFetchRawSummaryPr.mockReset().mockResolvedValue(raw);
  mockFingerprintRawSummaryPr.mockReset().mockReturnValue("fp-1");
  mockSummarizePollSummaryPr.mockReset().mockResolvedValue({ checks: {}, review: {} });
  mockWriteReadyReceipt.mockReset().mockResolvedValue(undefined);
  mockUpdateReadyDelay.mockResolvedValue({
    isReady: true,
    shouldCancel: true,
    remainingSeconds: 0,
  });
});

describe("runIterate candidate-READY fresh read", () => {
  it("cancels as ready when the fresh read agrees", async () => {
    expect(await runIterate(makeOpts())).toMatchObject({
      action: "cancel",
      reason: "ready-delay-elapsed",
    });
  });

  it("waits when the fresh read shows queued Actions check runs and UNSTABLE (PR 54)", async () => {
    mockFetchRawSummaryPr.mockResolvedValue({ ...raw, mergeStateStatus: "UNSTABLE" });
    mockSummarizePollSummaryPr.mockResolvedValue({ checks: { inProgress: 2 }, review: {} });
    const result = await runIterate(makeOpts());
    expect(result).toMatchObject({
      action: "wait",
      shouldCancel: false,
      log: expect.stringContaining("a fresh read shows a relevant check is queued or in progress"),
    });
    expect(mockWriteReadyReceipt).not.toHaveBeenCalled();
    expect(mockClearReadyDelay).not.toHaveBeenCalled();
  });

  it("waits when the fresh read shows an Actions suite and no relevant check yet", async () => {
    mockSummarizePollSummaryPr.mockResolvedValue({
      checks: { actionsWorkflowInProgress: true },
      review: {},
    });
    expect(await runIterate(makeOpts())).toMatchObject({
      action: "wait",
      log: expect.stringContaining("an Actions workflow suite is still running"),
    });
  });

  it("waits when the merge state is no longer the one the report saw", async () => {
    mockFetchRawSummaryPr.mockResolvedValue({ ...raw, mergeStateStatus: "UNSTABLE" });
    expect(await runIterate(makeOpts())).toMatchObject({
      action: "wait",
      log: expect.stringContaining("the merge state changed to UNSTABLE"),
    });
  });

  it("waits when the head moved after the check ran", async () => {
    mockFetchRawSummaryPr.mockResolvedValue({ ...raw, headRefOid: "head-2" });
    expect(await runIterate(makeOpts())).toMatchObject({
      action: "wait",
      log: expect.stringContaining("the head moved"),
    });
  });

  it("does not merge while the fresh read regresses", async () => {
    mockSummarizePollSummaryPr.mockResolvedValue({ checks: { inProgress: 1 }, review: {} });
    const result = await runIterate(makeOpts({ merge: true }));
    expect(result.action).toBe("wait");
  });

  it("still cancels when the summary is not ready for a reason the next check owns", async () => {
    for (const summary of [
      { checks: { failing: 1 }, review: {} },
      { checks: { incomplete: true }, review: {} },
      { checks: {}, review: { actionable: 1 } },
    ]) {
      mockSummarizePollSummaryPr.mockResolvedValue(summary);
      expect(await runIterate(makeOpts())).toMatchObject({
        action: "cancel",
        reason: "ready-delay-elapsed",
      });
    }
  });

  it("keeps the stack receipt wording for a stack layer", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        headSha: "head-1",
        baseRefOid: "base-1",
        mergeStatus: {
          ...makeReport().mergeStatus,
          mergeRequirements: {
            approvals: { current: 1, requiredCount: 1 },
            conversationsResolved: { resolved: true, unresolvedCount: 0, required: true },
            stack: { number: 7, size: 2, position: 1, baseRefName: "main" },
          } as never,
        },
      }),
    );
    mockSummarizePollSummaryPr.mockResolvedValue({ checks: { inProgress: 1 }, review: {} });
    expect(await runIterate(makeOpts())).toMatchObject({
      action: "wait",
      log: expect.stringContaining("its stack readiness receipt was not certified: a relevant"),
    });
  });

  it("still cancels when the fresh read cannot be fetched", async () => {
    mockFetchRawSummaryPr.mockRejectedValue(new Error("boom"));
    expect(await runIterate(makeOpts())).toMatchObject({
      action: "cancel",
      reason: "ready-delay-elapsed",
    });
  });
});
