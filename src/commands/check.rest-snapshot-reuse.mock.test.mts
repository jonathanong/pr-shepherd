import { describe, expect, it, vi } from "vitest";

vi.mock("./check-fingerprint.mts", () => ({
  tryReuseFingerprintReport: vi.fn().mockResolvedValue(null),
  tryReuseRestSnapshotReport: vi.fn().mockResolvedValue(null),
}));
vi.mock("../state/rest-snapshot-report.mts", () => ({
  storeRestSnapshotReport: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../github/rest-conditional-scope.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../github/rest-conditional-scope.mts")>()),
  restSnapshotState: vi.fn().mockReturnValue({ allNotModified: true, digest: "snap" }),
}));

import {
  BASE_OPTS,
  makeBatchData,
  mockFetchPrBatch,
  registerHooks,
} from "../../test-helpers/commands/check.test-support.mts";
import { tryReuseRestSnapshotReport } from "./check-fingerprint.mts";
import { storeRestSnapshotReport } from "../state/rest-snapshot-report.mts";
import { runCheck } from "./check.mts";
import type { ShepherdReport } from "../types.mts";

registerHooks();

const mockReuse = vi.mocked(tryReuseRestSnapshotReport);
const mockStore = vi.mocked(storeRestSnapshotReport);

describe("runCheck — REST snapshot reuse", () => {
  it("returns the stored report when every REST read was not modified", async () => {
    const cached = {
      pr: 42,
      status: "IN_PROGRESS",
      repo: "owner/repo",
    } as ShepherdReport;
    mockFetchPrBatch.mockResolvedValueOnce({
      data: makeBatchData({ transport: "rest" }),
    });
    mockReuse.mockResolvedValueOnce(cached);
    const report = await runCheck({ ...BASE_OPTS, fingerprintCache: true });
    expect(report).toBe(cached);
    expect(mockReuse).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      { owner: "owner", repo: "repo", pr: 42 },
      expect.anything(),
      { allNotModified: true, digest: "snap" },
    );
    expect(mockStore).not.toHaveBeenCalled();
  });

  it("builds and stores a fresh report with the snapshot digest when reuse declines", async () => {
    mockFetchPrBatch.mockResolvedValueOnce({
      data: makeBatchData({ transport: "rest" }),
    });
    const report = await runCheck({ ...BASE_OPTS, fingerprintCache: true });
    expect(report.pr).toBe(42);
    expect(mockStore).toHaveBeenCalledWith(
      { owner: "owner", repo: "repo", pr: 42 },
      "snap",
      report,
      expect.anything(),
    );
  });

  it("does not consult or store the REST snapshot on a GraphQL snapshot", async () => {
    mockFetchPrBatch.mockResolvedValueOnce({ data: makeBatchData() });
    await runCheck({ ...BASE_OPTS, fingerprintCache: true });
    expect(mockReuse).toHaveBeenCalledWith(
      42,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      undefined,
    );
    expect(mockStore).not.toHaveBeenCalled();
  });
});
