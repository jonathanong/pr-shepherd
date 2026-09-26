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
  mockReadReadyReceipt,
  mockWriteReadyReceipt,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

const key = { owner: "owner", repo: "repo", pr: 42 };
const PROBE_UNAVAILABLE = Symbol.for("prShepherd.annotationProbeUnavailable");
const readyRaw = {
  state: "OPEN",
  isDraft: false,
  headRefOid: "head-1",
  baseRefOid: "base-1",
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
};

function markProbeUnavailable(raw: object): void {
  (raw as { [PROBE_UNAVAILABLE]?: true })[PROBE_UNAVAILABLE] = true;
}

beforeEach(() => {
  mockFetchRawSummaryPr.mockReset();
  mockFingerprintRawSummaryPr.mockReset();
  mockSummarizePollSummaryPr.mockReset();
  mockClearReadyReceipt.mockReset();
  mockReadReadyReceipt.mockReset();
  mockWriteReadyReceipt.mockReset();
  mockFetchRawSummaryPr.mockResolvedValue({ ...readyRaw });
  mockFingerprintRawSummaryPr.mockReturnValue("fingerprint-1");
  mockReadReadyReceipt.mockResolvedValue(null);
  mockSummarizePollSummaryPr.mockImplementation(async (raw: object) => {
    markProbeUnavailable(raw);
    return { checks: {}, review: {} };
  });
  mockUpdateReadyDelay.mockImplementation(async () => ({
    isReady: true,
    shouldCancel: true,
    remainingSeconds: 0,
  }));
});

describe("runIterate — annotation probe misses", () => {
  it("does not store a receipt when the probe is unavailable", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({ status: "READY", headSha: "head-1", baseRefOid: "base-1" }),
    );

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("cancel");
    expect(mockWriteReadyReceipt).not.toHaveBeenCalled();
  });

  it("keeps an existing receipt when a later probe is unavailable", async () => {
    mockReadReadyReceipt.mockResolvedValue({
      version: 1,
      ...key,
      headRefOid: "head-1",
      baseRefOid: "base-1",
      status: "READY",
      isDraft: false,
      readinessFingerprint: "fingerprint-1",
      recordedAtUnix: 1,
    });
    mockRunCheck.mockResolvedValue(
      makeReport({ status: "READY", headSha: "head-1", baseRefOid: "base-1" }),
    );

    const result = await runIterate(makeOpts({ merge: true }));

    expect(result.action).toBe("merge");
    expect(mockClearReadyReceipt).not.toHaveBeenCalled();
    expect(mockWriteReadyReceipt).not.toHaveBeenCalled();
  });

  it("clears a receipt when the probe misses and the head changed", async () => {
    mockFetchRawSummaryPr.mockResolvedValue({ ...readyRaw, headRefOid: "head-2" });
    mockReadReadyReceipt.mockResolvedValue({
      version: 1,
      ...key,
      headRefOid: "head-1",
      baseRefOid: "base-1",
      status: "READY",
      isDraft: false,
      readinessFingerprint: "fingerprint-1",
      recordedAtUnix: 1,
    });
    mockRunCheck.mockResolvedValue(
      makeReport({ status: "READY", headSha: "head-1", baseRefOid: "base-1" }),
    );

    await runIterate(makeOpts());

    expect(mockClearReadyReceipt).toHaveBeenCalledWith(key);
    expect(mockWriteReadyReceipt).not.toHaveBeenCalled();
  });
});
