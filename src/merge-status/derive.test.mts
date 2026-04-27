import { describe, it, expect } from "vitest";
import { deriveMergeStatus } from "./derive.mts";
import type { BatchPrData } from "../types.mts";

function makePr(overrides: Partial<BatchPrData>): BatchPrData {
  return {
    nodeId: "PR_kgDOAAA",
    number: 42,
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
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

// ---------------------------------------------------------------------------
// Interpretation order (first match wins)
// ---------------------------------------------------------------------------

describe("deriveMergeStatus", () => {
  it("CONFLICTING mergeable → CONFLICTS", () => {
    const result = deriveMergeStatus(makePr({ mergeable: "CONFLICTING" }));
    expect(result.status).toBe("CONFLICTS");
  });

  it("Copilot review requested → BLOCKED", () => {
    const result = deriveMergeStatus(
      makePr({ reviewRequests: [{ login: "copilot-pull-request-reviewer[bot]" }] }),
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.copilotReviewInProgress).toBe(true);
  });

  it("Copilot review PENDING in latestReviews → BLOCKED", () => {
    const result = deriveMergeStatus(
      makePr({
        latestReviews: [{ login: "copilot[bot]", state: "PENDING" }],
      }),
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.copilotReviewInProgress).toBe(true);
  });

  it("Copilot review APPROVED in latestReviews → not copilotInProgress", () => {
    const result = deriveMergeStatus(
      makePr({
        latestReviews: [{ login: "copilot[bot]", state: "APPROVED" }],
      }),
    );
    expect(result.copilotReviewInProgress).toBe(false);
  });

  it("CONFLICTING takes priority over copilot blocked", () => {
    const result = deriveMergeStatus(
      makePr({
        mergeable: "CONFLICTING",
        reviewRequests: [{ login: "copilot[bot]" }],
      }),
    );
    expect(result.status).toBe("CONFLICTS");
  });

  it("BEHIND mergeStateStatus → BEHIND", () => {
    const result = deriveMergeStatus(makePr({ mergeStateStatus: "BEHIND" }));
    expect(result.status).toBe("BEHIND");
  });

  it("BLOCKED mergeStateStatus → BLOCKED", () => {
    const result = deriveMergeStatus(makePr({ mergeStateStatus: "BLOCKED" }));
    expect(result.status).toBe("BLOCKED");
  });

  it("UNSTABLE mergeStateStatus → UNSTABLE", () => {
    const result = deriveMergeStatus(makePr({ mergeStateStatus: "UNSTABLE" }));
    expect(result.status).toBe("UNSTABLE");
  });

  it("isDraft → DRAFT", () => {
    const result = deriveMergeStatus(makePr({ isDraft: true }));
    expect(result.status).toBe("DRAFT");
  });

  it("UNKNOWN mergeStateStatus → UNKNOWN", () => {
    const result = deriveMergeStatus(makePr({ mergeStateStatus: "UNKNOWN" }));
    expect(result.status).toBe("UNKNOWN");
  });

  it("CLEAN mergeStateStatus → CLEAN", () => {
    const result = deriveMergeStatus(makePr({ mergeStateStatus: "CLEAN" }));
    expect(result.status).toBe("CLEAN");
  });

  it("includes full detail fields in result", () => {
    const result = deriveMergeStatus(
      makePr({ reviewDecision: "CHANGES_REQUESTED", isDraft: false }),
    );
    expect(result.reviewDecision).toBe("CHANGES_REQUESTED");
    expect(result.isDraft).toBe(false);
    expect(result.mergeable).toBe("MERGEABLE");
  });
});

describe("deriveMergeStatus — state pass-through", () => {
  it("passes OPEN state through", () => {
    const result = deriveMergeStatus(makePr({ state: "OPEN" }));
    expect(result.state).toBe("OPEN");
  });

  it("passes MERGED state through", () => {
    const result = deriveMergeStatus(
      makePr({ state: "MERGED", mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }),
    );
    expect(result.state).toBe("MERGED");
  });

  it("passes CLOSED state through", () => {
    const result = deriveMergeStatus(
      makePr({ state: "CLOSED", mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }),
    );
    expect(result.state).toBe("CLOSED");
  });
});
