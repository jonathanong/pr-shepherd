/* eslint-disable max-lines */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../state/pr-fingerprint.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/pr-fingerprint.mts")>();
  return { ...actual, loadPrFingerprint: vi.fn() };
});
vi.mock("../github/fingerprint.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../github/fingerprint.mts")>();
  return { ...actual, fetchPrFingerprint: vi.fn() };
});
vi.mock("../github/client.mts", () => ({
  getMergeableState: vi.fn(),
}));

import { fingerprintInputDigest, loadPrFingerprint } from "../state/pr-fingerprint.mts";
import { fetchPrFingerprint } from "../github/fingerprint.mts";
import { getMergeableState } from "../github/client.mts";
import { tryReuseFingerprintReport } from "./check-fingerprint.mts";
import {
  testFingerprint,
  testShepherdConfig,
} from "../../test-helpers/github/fingerprint-fixture.mts";
import type { ShepherdReport } from "../types.mts";

const mockLoad = vi.mocked(loadPrFingerprint);
const mockFetch = vi.mocked(fetchPrFingerprint);
const mockMergeable = vi.mocked(getMergeableState);
const REPO = { owner: "owner", name: "repo" };
const KEY = { owner: "owner", repo: "repo", pr: 42 };
const FP = testFingerprint();
const CONFIG = testShepherdConfig({ botUsernames: ["coderabbitai"] });

function stored(report: ShepherdReport) {
  return {
    version: 3 as const,
    inputDigest: fingerprintInputDigest(CONFIG),
    fingerprint: FP,
    report,
  };
}

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

  it("does not skip when a thread has more than one comment", async () => {
    const report = waitReport();
    mockLoad.mockResolvedValue(stored(report));
    mockFetch.mockResolvedValueOnce(testFingerprint({ hasMultiCommentThreads: true }));
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
  });

  it("does not skip when more than 20 review threads exist", async () => {
    const report = waitReport();
    mockLoad.mockResolvedValue(stored(report));
    mockFetch.mockResolvedValueOnce(testFingerprint({ threadCount: 21 }));
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
  });

  it("does not skip when merge-policy rules are truncated", async () => {
    const report = waitReport();
    mockLoad.mockResolvedValue(stored(report));
    mockFetch.mockResolvedValueOnce(testFingerprint({ rulesComplete: false }));
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
  });

  it("does not skip when more than 100 reviews exist", async () => {
    const report = waitReport();
    mockLoad.mockResolvedValue(stored(report));
    mockFetch.mockResolvedValueOnce(testFingerprint({ reviewCount: 101 }));
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
  });

  it("does not skip when more than 100 comments exist", async () => {
    const report = waitReport();
    mockLoad.mockResolvedValue(stored(report));
    mockFetch.mockResolvedValueOnce(testFingerprint({ commentCount: 101 }));
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
  });

  it("does not skip when no fingerprint is stored", async () => {
    mockLoad.mockResolvedValue(null);
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns the cached WAIT-shaped report when the live fingerprint matches", async () => {
    const report = waitReport();
    mockLoad.mockResolvedValue(stored(report));
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toEqual({
      ...report,
      fingerprintReused: true,
    });
    expect(mockFetch).toHaveBeenCalledWith(42, REPO);
  });

  it("does not skip when the cached report has first-look threads", async () => {
    mockLoad.mockResolvedValue(
      stored(
        waitReport({
          threads: {
            actionable: [],
            resolutionOnly: [],
            autoResolved: [],
            autoResolveErrors: [],
            firstLook: [{ id: "t1" } as ShepherdReport["threads"]["firstLook"][number]],
          },
        }),
      ),
    );
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not skip when the cached report has failing checks", async () => {
    mockLoad.mockResolvedValue(
      stored(
        waitReport({
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
      ),
    );
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not skip when the PR is in the merge queue", async () => {
    mockLoad.mockResolvedValue(
      stored(waitReport({ mergeQueue: { enabled: true, inQueue: true } })),
    );
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not skip when classification inputs change", async () => {
    const report = waitReport();
    mockLoad.mockResolvedValue({ ...stored(report), inputDigest: "stale" });
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not skip when the live fingerprint differs", async () => {
    const report = waitReport();
    mockLoad.mockResolvedValue(stored(report));
    mockFetch.mockResolvedValueOnce(testFingerprint({ commentCount: 9, latestCommentId: "c9" }));
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
  });

  it("does not skip a READY report", async () => {
    mockLoad.mockResolvedValue(stored(waitReport({ status: "READY" })));
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("tags a reused WAIT report as fingerprintReused", async () => {
    const report = waitReport();
    mockLoad.mockResolvedValue(stored(report));
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toEqual({
      ...report,
      fingerprintReused: true,
    });
  });

  it("does not skip when REST mergeability is CLEAN but the cached report is UNKNOWN", async () => {
    const report = waitReport({
      status: "UNKNOWN",
      mergeStatus: {
        status: "UNKNOWN",
        mergeable: "UNKNOWN",
        mergeStateStatus: "UNKNOWN",
        state: "OPEN",
        isDraft: false,
        reviewDecision: null,
        blockingBotReviewInProgress: false,
      },
    });
    mockLoad.mockResolvedValue(stored(report));
    mockMergeable.mockResolvedValue({
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      state: "OPEN",
    });
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
  });

  it("does not skip a READY report when REST mergeability is BEHIND", async () => {
    const report = waitReport({ status: "READY" });
    mockLoad.mockResolvedValue(stored(report));
    mockMergeable.mockResolvedValue({
      mergeable: "MERGEABLE",
      mergeStateStatus: "BEHIND",
      state: "OPEN",
    });
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
  });

  it("does not skip when the live check-suite page is truncated", async () => {
    const report = waitReport();
    mockLoad.mockResolvedValue(stored(report));
    mockFetch.mockResolvedValueOnce(testFingerprint({ checkSuitesComplete: false }));
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
    expect(mockMergeable).not.toHaveBeenCalled();
  });

  it("does not skip when the stored check-suite page was truncated", async () => {
    const report = waitReport();
    mockLoad.mockResolvedValue({
      ...stored(report),
      fingerprint: testFingerprint({ checkSuitesComplete: false }),
    });
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
  });

  it("does not skip a READY report when stored merge policy is missing", async () => {
    const report = waitReport({ status: "READY" });
    mockLoad.mockResolvedValue({
      ...stored(report),
      fingerprint: testFingerprint({ mergePolicy: "" }),
    });
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
    expect(mockMergeable).not.toHaveBeenCalled();
  });

  it("does not skip a READY report when live merge policy is missing", async () => {
    const report = waitReport({ status: "READY" });
    mockLoad.mockResolvedValue(stored(report));
    mockFetch.mockResolvedValueOnce(testFingerprint({ mergePolicy: "" }));
    await expect(tryReuseFingerprintReport(42, REPO, KEY, CONFIG)).resolves.toBeNull();
    expect(mockMergeable).not.toHaveBeenCalled();
  });
});
