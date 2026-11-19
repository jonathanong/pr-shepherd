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
  mockWriteReadyReceipt,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

const raw = {
  state: "OPEN",
  isDraft: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  headRefOid: "head-1",
  baseRefOid: "base-1",
};
const PREFIX = "WAIT: PR #42 reached ready-delay but its stack readiness receipt";

function layer(report: Record<string, unknown> = {}, mergeStatus: Record<string, unknown> = {}) {
  mockRunCheck.mockResolvedValue(
    makeReport({
      status: "READY",
      headSha: "head-1",
      baseRefOid: "base-1",
      ...report,
      mergeStatus: {
        ...makeReport().mergeStatus,
        mergeRequirements: {
          approvals: { current: 1, requiredCount: 1 },
          conversationsResolved: { resolved: true, unresolvedCount: 0, required: true },
          stack: { number: 7, size: 2, position: 1, baseRefName: "main" },
        },
        ...mergeStatus,
      },
    }),
  );
}

async function logFor(): Promise<string> {
  const result = await runIterate(makeOpts());
  if (result.action !== "wait") throw new Error(`expected wait, got ${result.action}`);
  return result.log;
}

beforeEach(() => {
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

describe("stack receipt reasons", () => {
  it("names a moved base with short SHAs", async () => {
    layer({ baseRefOid: "abc1234567" });
    mockFetchRawSummaryPr.mockResolvedValue({ ...raw, baseRefOid: "def5678901" });
    expect(await logFor()).toBe(
      `${PREFIX} was not certified: base moved (report abc1234, fresh def5678)`,
    );
  });

  it("names a moved head with short SHAs", async () => {
    layer({ headSha: "1111111999" });
    mockFetchRawSummaryPr.mockResolvedValue({ ...raw, headRefOid: "2222222999" });
    expect(await logFor()).toContain("head moved (report 1111111, fresh 2222222)");
  });

  it("names a report that is not READY", async () => {
    layer({ status: "PENDING" });
    expect(await logFor()).toContain("report status is PENDING, not READY");
  });

  it("names a report without a head SHA", async () => {
    layer({ headSha: "" });
    expect(await logFor()).toContain("report has no head SHA");
  });

  it("names a report without a base SHA", async () => {
    layer({ baseRefOid: "" });
    expect(await logFor()).toContain("report has no base SHA");
  });

  it("names a fresh summary without a fingerprint", async () => {
    layer();
    mockFingerprintRawSummaryPr.mockReturnValue(null);
    expect(await logFor()).toContain("fresh summary has no fingerprint");
  });

  it("names a fresh summary that is not OPEN", async () => {
    layer();
    mockFetchRawSummaryPr.mockResolvedValue({ ...raw, state: "MERGED" });
    expect(await logFor()).toContain("fresh summary shows PR MERGED, not OPEN");
  });

  it("names a fresh summary that is a draft", async () => {
    layer();
    mockFetchRawSummaryPr.mockResolvedValue({ ...raw, isDraft: true });
    expect(await logFor()).toContain("fresh summary shows PR as a draft");
  });

  it("names an unavailable annotation probe", async () => {
    layer();
    mockFetchRawSummaryPr.mockResolvedValue({
      ...raw,
      [Symbol.for("prShepherd.annotationProbeUnavailable")]: true,
    });
    expect(await logFor()).toContain("annotation probe unavailable");
  });

  it("names a fresh summary that is not ready", async () => {
    layer();
    mockSummarizePollSummaryPr.mockResolvedValue({ checks: { failing: 1 }, review: {} });
    expect(await logFor()).toContain("fresh summary is not ready");
  });

  it("names changed merge-queue removal evidence", async () => {
    layer({
      mergeQueue: {
        enabled: true,
        inQueue: false,
        removalAcknowledged: true,
        latestRemoval: { reason: "failed_checks", createdAtUnix: 1, beforeCommitOid: "q-1" },
      },
    });
    expect(await logFor()).toContain("merge-queue removal evidence changed");
  });

  it("says unavailable with the message when the summary fetch fails", async () => {
    layer();
    mockFetchRawSummaryPr.mockRejectedValue(new Error("boom"));
    expect(await logFor()).toBe(`${PREFIX} was not certified: fresh summary unavailable: boom`);
  });

  it("stringifies a non-Error thrown value", async () => {
    layer();
    mockFetchRawSummaryPr.mockRejectedValue("plain");
    expect(await logFor()).toContain("fresh summary unavailable: plain");
  });

  it("says could not be persisted, with the error, only when the write fails", async () => {
    layer();
    mockWriteReadyReceipt.mockRejectedValue(new Error("disk full"));
    expect(await logFor()).toBe(`${PREFIX} could not be persisted: disk full`);
  });
});
