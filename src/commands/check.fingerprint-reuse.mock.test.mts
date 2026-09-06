import { describe, expect, it, vi } from "vitest";

vi.mock("./check-fingerprint.mts", () => ({
  tryReuseFingerprintReport: vi.fn().mockResolvedValue(null),
}));

import {
  BASE_OPTS,
  makeBatchData,
  mockFetchPrBatch,
  registerHooks,
} from "../../test-helpers/commands/check.test-support.mts";
import { tryReuseFingerprintReport } from "./check-fingerprint.mts";
import { runCheck } from "./check.mts";
import type { ShepherdReport } from "../types.mts";

registerHooks();

const mockReuse = vi.mocked(tryReuseFingerprintReport);

describe("runCheck — fingerprint reuse", () => {
  it("returns a cached WAIT report without fetching BatchPr", async () => {
    const cached = { pr: 42, status: "IN_PROGRESS", repo: "owner/repo" } as ShepherdReport;
    mockReuse.mockResolvedValueOnce(cached);
    const report = await runCheck({ ...BASE_OPTS });
    expect(report).toBe(cached);
    expect(mockFetchPrBatch).not.toHaveBeenCalled();
  });

  it("fetches BatchPr when fingerprintCache is false", async () => {
    mockReuse.mockResolvedValueOnce({
      pr: 99,
      status: "IN_PROGRESS",
      repo: "owner/repo",
    } as ShepherdReport);
    mockFetchPrBatch.mockResolvedValueOnce({ data: makeBatchData() });
    const report = await runCheck({ ...BASE_OPTS, persistSeen: false, fingerprintCache: false });
    expect(mockFetchPrBatch).toHaveBeenCalled();
    expect(report.pr).toBe(42);
    expect(mockReuse).not.toHaveBeenCalled();
  });
});
