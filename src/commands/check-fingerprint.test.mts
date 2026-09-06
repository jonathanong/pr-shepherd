import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../state/pr-fingerprint.mts", () => ({
  loadPrFingerprint: vi.fn(),
}));
vi.mock("../github/fingerprint.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../github/fingerprint.mts")>();
  return { ...actual, fetchPrFingerprint: vi.fn() };
});
vi.mock("../github/client.mts", () => ({
  getMergeableState: vi.fn(),
}));

import { loadPrFingerprint } from "../state/pr-fingerprint.mts";
import { fetchPrFingerprint } from "../github/fingerprint.mts";
import { tryReuseFingerprintReport } from "./check-fingerprint.mts";
import { testFingerprint } from "../../test-helpers/github/fingerprint-fixture.mts";
import type { ShepherdReport } from "../types.mts";

const mockLoad = vi.mocked(loadPrFingerprint);
const mockFetch = vi.mocked(fetchPrFingerprint);
const REPO = { owner: "owner", name: "repo" };
const KEY = { owner: "owner", repo: "repo", pr: 42 };
const FP = testFingerprint();

function waitReport(overrides: Partial<ShepherdReport> = {}): ShepherdReport {
  return {
    pr: 42,
    nodeId: "PR_1",
    repo: "owner/repo",
    status: "IN_PROGRESS",
    baseBranch: "main",
    mergeStatus: {
      status: "CLEAN",
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      state: "OPEN",
      isDraft: false,
      reviewDecision: null,
      blockingBotReviewInProgress: false,
    },
    checks: {
      passing: [],
      failing: [],
      inProgress: [],
      skipped: [],
      filtered: [],
      filteredNames: [],
      blockedByFilteredCheck: false,
    },
    threads: {
      actionable: [],
      resolutionOnly: [],
      autoResolved: [],
      autoResolveErrors: [],
      firstLook: [],
    },
    comments: { actionable: [], firstLook: [] },
    changesRequestedReviews: [],
    reviewSummaries: [],
    firstLookSummaries: [],
    editedSummaries: [],
    approvedReviews: [],
    branchProtection: null,
    ...overrides,
  };
}

describe("tryReuseFingerprintReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(FP);
  });

  it("returns the cached WAIT-shaped report when the live fingerprint matches", async () => {
    const report = waitReport();
    mockLoad.mockResolvedValue({ version: 1, fingerprint: FP, report });
    await expect(tryReuseFingerprintReport(42, REPO, KEY)).resolves.toEqual(report);
    expect(mockFetch).toHaveBeenCalledWith(42, REPO);
  });

  it("does not skip when the cached report has first-look threads", async () => {
    mockLoad.mockResolvedValue({
      version: 1,
      fingerprint: FP,
      report: waitReport({
        threads: {
          actionable: [],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [{ id: "t1" } as ShepherdReport["threads"]["firstLook"][number]],
        },
      }),
    });
    await expect(tryReuseFingerprintReport(42, REPO, KEY)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not skip when the cached report has failing checks", async () => {
    mockLoad.mockResolvedValue({
      version: 1,
      fingerprint: FP,
      report: waitReport({
        checks: {
          passing: [],
          failing: [{ name: "CI" } as ShepherdReport["checks"]["failing"][number]],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    });
    await expect(tryReuseFingerprintReport(42, REPO, KEY)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
