import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../github/client.mts", () => ({
  getMergeableState: vi.fn(),
}));

import {
  isBlockedByFilteredCheck,
  refreshReadyMergeability,
  refreshUnknownMergeability,
} from "./ready-mergeability.mts";
import { getMergeableState } from "../github/client.mts";
import type { BatchPrData } from "../types.mts";

const mockGetMergeableState = vi.mocked(getMergeableState);
const REPO = { owner: "owner", name: "repo" };

function makeBatch(overrides: Partial<BatchPrData> = {}): BatchPrData {
  return {
    nodeId: "PR_1",
    number: 42,
    state: "OPEN",
    isDraft: false,
    mergeable: "UNKNOWN",
    mergeStateStatus: "UNKNOWN",
    reviewDecision: "APPROVED",
    headRefOid: "abc123",
    headRefName: "feature",
    headRepoWithOwner: "owner/repo",
    baseRefName: "main",
    reviewRequests: [],
    latestReviews: [],
    reviewThreads: [],
    comments: [],
    changesRequestedReviews: [],
    reviewSummaries: [],
    approvedReviews: [],
    checks: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("refreshUnknownMergeability", () => {
  it("does not refresh closed PRs or PRs with known mergeability", async () => {
    await expect(
      refreshUnknownMergeability(42, REPO, makeBatch({ state: "CLOSED" })),
    ).resolves.toMatchObject({ didRefresh: false });
    await expect(
      refreshUnknownMergeability(
        42,
        REPO,
        makeBatch({ mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" }),
      ),
    ).resolves.toMatchObject({ didRefresh: false });
    expect(mockGetMergeableState).not.toHaveBeenCalled();
  });
});

describe("refreshReadyMergeability", () => {
  it("falls back to existing mergeability fields when REST returns nulls", async () => {
    const batch = makeBatch({
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: "APPROVED",
      checks: [
        {
          name: "ci",
          status: "COMPLETED",
          conclusion: "SUCCESS",
          detailsUrl: "",
          event: "pull_request",
          runId: null,
        },
      ],
    });
    mockGetMergeableState.mockResolvedValue({
      mergeable: null as unknown as "MERGEABLE",
      mergeStateStatus: null as unknown as "CLEAN",
    });

    const refreshed = await refreshReadyMergeability(
      42,
      REPO,
      batch,
      {
        allPassed: true,
        anyFailing: false,
        anyInProgress: false,
        hasChecks: true,
        filteredNames: [],
      },
      0,
      0,
    );

    expect(refreshed.batchData.mergeable).toBe("MERGEABLE");
    expect(refreshed.batchData.mergeStateStatus).toBe("CLEAN");
    expect(refreshed.status).toBe("READY");
  });
});

describe("isBlockedByFilteredCheck", () => {
  it("requires BLOCKED merge state, no failing/running checks, and at least one filtered check", () => {
    const mergeStatus = {
      status: "BLOCKED" as const,
      state: "OPEN" as const,
      isDraft: false,
      mergeable: "MERGEABLE" as const,
      reviewDecision: "APPROVED" as const,
      blockingBotReviewInProgress: false,
      mergeStateStatus: "BLOCKED" as const,
    };

    expect(
      isBlockedByFilteredCheck(mergeStatus, {
        allPassed: true,
        anyFailing: false,
        anyInProgress: false,
        hasChecks: true,
        filteredNames: ["ci / push"],
      }),
    ).toBe(true);
    expect(
      isBlockedByFilteredCheck(mergeStatus, {
        allPassed: false,
        anyFailing: true,
        anyInProgress: false,
        hasChecks: true,
        filteredNames: ["ci / push"],
      }),
    ).toBe(false);
    expect(
      isBlockedByFilteredCheck(mergeStatus, {
        allPassed: false,
        anyFailing: false,
        anyInProgress: true,
        hasChecks: true,
        filteredNames: ["ci / push"],
      }),
    ).toBe(false);
    expect(
      isBlockedByFilteredCheck(
        { ...mergeStatus, status: "CLEAN" },
        {
          allPassed: true,
          anyFailing: false,
          anyInProgress: false,
          hasChecks: true,
          filteredNames: ["ci / push"],
        },
      ),
    ).toBe(false);
  });
});
