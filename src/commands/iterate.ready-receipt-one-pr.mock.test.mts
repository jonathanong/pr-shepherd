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
  mockRunCheck,
  mockClearReadyDelay,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { makeThread } from "../../test-helpers/commands/iterate-thread-test-support.mts";
import { runIterate } from "./iterate/index.mts";

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
const hiddenNotice = {
  id: "comment-1",
  author: "summary-bot",
  authorType: "Bot" as const,
  body: "<!-- generated summary -->",
  createdAtUnix: 0,
  url: "",
  isMinimized: true,
  firstLookStatus: "minimized" as const,
};

function onePrReport(overrides: Parameters<typeof makeReport>[0] = {}) {
  return makeReport({ status: "READY", headSha: "head-1", baseRefOid: "base-1", ...overrides });
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

describe("runIterate — one-PR READY receipt", () => {
  it("merges a --merge rerun from a current receipt without waiting again", async () => {
    mockRunCheck.mockResolvedValue(onePrReport());

    const result = await runIterate(makeOpts({ merge: true }));

    expect(result.action).toBe("merge");
    expect(mockUpdateReadyDelay).toHaveBeenCalledExactlyOnceWith(42, true, 600, "owner", "repo", {
      headSha: "head-1",
      alreadyElapsed: true,
    });
    expect(mockWriteReadyReceipt).not.toHaveBeenCalled();
    expect(mockClearReadyDelay).toHaveBeenCalledWith(42, "owner", "repo");
  });

  it.each([
    ["head", { headRefOid: "head-2" }],
    ["base", { baseRefOid: "base-2" }],
  ])("rejects a receipt when the fresh snapshot names another %s", async (_name, moved) => {
    mockRunCheck.mockResolvedValue(onePrReport());
    mockFetchRawSummaryPr.mockResolvedValue({
      state: "OPEN",
      isDraft: false,
      headRefOid: "head-1",
      baseRefOid: "base-1",
      ...moved,
    });

    const result = await runIterate(makeOpts({ merge: true }));

    expect(result.action).toBe("ready");
    expect(mockClearReadyReceipt).toHaveBeenCalledWith(key);
    expect(mockUpdateReadyDelay).toHaveBeenCalledWith(42, true, 600, "owner", "repo", {
      headSha: "head-1",
      alreadyElapsed: false,
    });
  });

  it("keeps the countdown and the receipt while a hidden comment is acknowledged", async () => {
    mockRunCheck.mockResolvedValue(
      onePrReport({ comments: { actionable: [], firstLook: [hiddenNotice] } }),
    );

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    expect(mockUpdateReadyDelay).toHaveBeenCalledWith(42, true, 600, "owner", "repo", {
      headSha: "head-1",
      alreadyElapsed: true,
    });
    expect(mockClearReadyReceipt).not.toHaveBeenCalled();
    expect(mockClearReadyDelay).not.toHaveBeenCalled();
  });

  it("restarts the countdown for new activity on a resolved thread", async () => {
    const thread = { ...makeThread(), firstLookStatus: "resolved" as const };
    mockRunCheck.mockResolvedValue(
      onePrReport({
        threads: {
          actionable: [],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [thread],
        },
      }),
    );

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    expect(mockClearReadyReceipt).toHaveBeenCalledWith(key);
    expect(mockUpdateReadyDelay).toHaveBeenCalledWith(42, false, 600, "owner", "repo", {
      headSha: "head-1",
      alreadyElapsed: false,
    });
  });
});
