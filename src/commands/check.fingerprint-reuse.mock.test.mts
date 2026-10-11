import { describe, expect, it, vi } from "vitest";

vi.mock("./check-fingerprint.mts", () => ({
  fingerprintReuser: vi.fn().mockResolvedValue(undefined),
  tryReuseRestSnapshotReport: vi.fn().mockResolvedValue(null),
}));
vi.mock("./check-unreported.mts", async (importActual) => ({
  ...(await importActual<typeof import("./check-unreported.mts")>()),
  refreshCachedUnreported: vi.fn(async (report: unknown) => report),
}));
vi.mock("./check-wait-detectors.mts", () => ({
  readWaitDetectors: vi.fn().mockResolvedValue(undefined),
  recordWaitDetectors: vi.fn().mockResolvedValue(undefined),
}));

import {
  BASE_OPTS,
  makeBatchData,
  mockFetchPrBatch,
  registerHooks,
} from "../../test-helpers/commands/check.test-support.mts";
import { fingerprintReuser } from "./check-fingerprint.mts";
import { refreshCachedUnreported } from "./check-unreported.mts";
import { runCheck } from "./check.mts";
import type { ShepherdReport } from "../types.mts";

registerHooks();

const mockReuser = vi.mocked(fingerprintReuser);
const mockRefresh = vi.mocked(refreshCachedUnreported);

describe("runCheck — fingerprint reuse", () => {
  it("returns the cached report when BatchPr's first page matches the fingerprint", async () => {
    const cached = { pr: 42, status: "IN_PROGRESS", repo: "owner/repo" } as ShepherdReport;
    const decide = vi.fn().mockResolvedValue(cached);
    mockReuser.mockResolvedValueOnce(decide);
    mockFetchPrBatch.mockResolvedValueOnce({ reused: cached } as never);
    const report = await runCheck({ ...BASE_OPTS, fingerprintCache: true });
    expect(report).toBe(cached);
    expect(mockFetchPrBatch).toHaveBeenCalledWith(42, expect.anything(), expect.anything(), decide);
  });

  it("checks afresh without reuse when the cached report's trunk contexts changed", async () => {
    const cached = { pr: 42, status: "READY", repo: "owner/repo" } as ShepherdReport;
    mockReuser.mockResolvedValueOnce(vi.fn());
    mockRefresh.mockResolvedValueOnce(null);
    mockFetchPrBatch
      .mockResolvedValueOnce({ reused: cached } as never)
      .mockResolvedValueOnce({ data: makeBatchData() });
    const report = await runCheck({ ...BASE_OPTS, persistSeen: false, fingerprintCache: true });
    expect(report).not.toBe(cached);
    expect(report.pr).toBe(42);
    expect(mockReuser).toHaveBeenCalledTimes(1);
    expect(mockFetchPrBatch).toHaveBeenLastCalledWith(42, expect.anything(), expect.anything());
  });

  it("does not offer reuse on a single-tick iterate", async () => {
    mockFetchPrBatch.mockResolvedValueOnce({ data: makeBatchData() });
    const report = await runCheck({ ...BASE_OPTS });
    expect(mockFetchPrBatch).toHaveBeenCalledWith(42, expect.anything(), expect.anything());
    expect(report.pr).toBe(42);
    expect(mockReuser).not.toHaveBeenCalled();
  });

  it("fetches a full snapshot when no stored report can be reused", async () => {
    mockFetchPrBatch.mockResolvedValueOnce({ data: makeBatchData() });
    const report = await runCheck({ ...BASE_OPTS, persistSeen: false, fingerprintCache: true });
    expect(mockReuser).toHaveBeenCalled();
    expect(mockFetchPrBatch).toHaveBeenCalledWith(42, expect.anything(), expect.anything());
    expect(report.pr).toBe(42);
  });
});
