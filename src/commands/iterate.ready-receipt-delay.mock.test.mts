import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetchRawSummaryPr, mockFingerprintRawSummaryPr, mockSummarizePollSummaryPr } =
  vi.hoisted(() => ({
    mockFetchRawSummaryPr: vi.fn(),
    mockFingerprintRawSummaryPr: vi.fn(),
    mockSummarizePollSummaryPr: vi.fn(),
  }));

vi.mock("../../src/github/poll-summary.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/github/poll-summary.mts")>()),
  fetchPollSummary: vi.fn(async () => ({ prs: [], stackAncestry: [] })),
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
  mockClearReadyReceipt,
  mockIsReadyReceiptCurrent,
  mockReadReadyReceipt,
  mockWriteReadyReceipt,
  makeOpts,
  makeReport,
  makeReview,
  mockAutoMinimizeComments,
  mockRunCheck,
  mockClearReadyDelay,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import type { CheckExecutionContext } from "./check-execution-context.mts";
import type { RawSummaryPr } from "../github/poll-summary-raw.mts";

registerIterateHooks();

const key = { owner: "owner", repo: "repo", pr: 42 };
const receipt = {
  version: 1 as const,
  ...key,
  headRefOid: "head-1",
  baseRefOid: "base-1",
  status: "READY" as const,
  isDraft: false as const,
  readinessFingerprint: "fingerprint-1",
  recordedAtUnix: 1_700_000_000,
};

function stackReport(overrides: Parameters<typeof makeReport>[0] = {}) {
  return makeReport({
    status: "READY",
    headSha: "head-1",
    baseRefOid: "base-1",
    mergeStatus: {
      ...makeReport().mergeStatus,
      mergeRequirements: {
        approvals: { current: 1, requiredCount: 1 },
        conversationsResolved: { resolved: true, unresolvedCount: 0, required: true },
        stack: { number: 7, size: 2, position: 1, baseRefName: "main" },
      },
    },
    ...overrides,
  });
}

beforeEach(() => {
  for (const mock of [
    mockClearReadyReceipt,
    mockFetchRawSummaryPr,
    mockFingerprintRawSummaryPr,
    mockIsReadyReceiptCurrent,
    mockReadReadyReceipt,
    mockSummarizePollSummaryPr,
    mockWriteReadyReceipt,
  ]) {
    mock.mockReset();
  }
  mockReadReadyReceipt.mockResolvedValue(receipt);
  mockFetchRawSummaryPr.mockResolvedValue({
    state: "OPEN",
    isDraft: false,
    headRefOid: "head-1",
    baseRefOid: "base-1",
  });
  mockFingerprintRawSummaryPr.mockReturnValue("fingerprint-1");
  mockIsReadyReceiptCurrent.mockReturnValue(true);
  mockSummarizePollSummaryPr.mockResolvedValue({ checks: {}, review: {} });
  mockUpdateReadyDelay.mockImplementation(
    async (_pr, isReady, delay, _owner, _repo, options?: { alreadyElapsed?: boolean }) =>
      isReady && options?.alreadyElapsed
        ? { isReady: true, shouldCancel: true, remainingSeconds: 0 }
        : { isReady, shouldCancel: false, remainingSeconds: delay },
  );
});

describe("runIterate — current stack READY receipt", () => {
  it("falls back to a fresh summary when the same-request hint names another head", async () => {
    mockRunCheck.mockImplementation(async (_opts: unknown, context?: CheckExecutionContext) => {
      context?.setReceiptSummary({
        number: 42,
        headRefOid: "other-head",
        baseRefOid: "base-1",
      } as RawSummaryPr);
      return stackReport();
    });

    expect((await runIterate(makeOpts())).action).toBe("cancel");
    expect(mockFetchRawSummaryPr).toHaveBeenCalledTimes(1);
  });

  it("falls back to a fresh read after an in-process review mutation", async () => {
    mockRunCheck.mockImplementation(async (_opts: unknown, context?: CheckExecutionContext) => {
      context?.setReceiptSummary({
        number: 42,
        headRefOid: "head-1",
        baseRefOid: "base-1",
      } as RawSummaryPr);
      return stackReport({
        reviewSummaries: [makeReview("PRR_BOT", "copilot-pull-request-reviewer", "overview")],
      });
    });

    expect((await runIterate(makeOpts())).action).toBe("cancel");
    expect(mockAutoMinimizeComments).toHaveBeenCalledWith(["PRR_BOT"]);
    expect(mockFetchRawSummaryPr).toHaveBeenCalledTimes(1);
  });

  it("cancels a re-polled layer without restarting the ready-delay", async () => {
    mockRunCheck.mockResolvedValue(stackReport());

    const result = await runIterate(makeOpts());

    expect(result).toMatchObject({ action: "cancel", reason: "ready-delay-elapsed" });
    expect(mockUpdateReadyDelay).toHaveBeenCalledExactlyOnceWith(42, true, 600, "owner", "repo", {
      headSha: "head-1",
      alreadyElapsed: true,
    });
    expect(mockClearReadyReceipt).not.toHaveBeenCalled();
    expect(mockWriteReadyReceipt).not.toHaveBeenCalled();
    expect(mockClearReadyDelay).toHaveBeenCalledWith(42, "owner", "repo");
  });

  it("restarts the ready-delay when the head or base moved since the receipt", async () => {
    mockRunCheck.mockResolvedValue(stackReport({ baseRefOid: "base-2" }));
    mockFetchRawSummaryPr.mockResolvedValue({
      state: "OPEN",
      isDraft: false,
      headRefOid: "head-1",
      baseRefOid: "base-2",
    });
    mockIsReadyReceiptCurrent.mockReturnValue(false);

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("ready");
    expect(result.remainingSeconds).toBe(600);
    expect(mockClearReadyReceipt).toHaveBeenCalledWith(key);
    expect(mockUpdateReadyDelay).toHaveBeenCalledWith(42, true, 600, "owner", "repo", {
      headSha: "head-1",
      alreadyElapsed: false,
    });
    expect(mockWriteReadyReceipt).not.toHaveBeenCalled();
  });
});
