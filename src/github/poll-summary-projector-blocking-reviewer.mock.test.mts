import { expect, it, vi } from "vitest";

vi.mock("../state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/seen-comments.mts")>();
  return { ...actual, loadSeenMap: vi.fn().mockResolvedValue(new Map()) };
});

import { summarizePollSummaryPr } from "./poll-summary-projector.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

it("keeps a draft waiting while a configured reviewer is pending", async () => {
  const raw = {
    number: 42,
    title: "Widgets",
    url: "https://github.com/acme/widgets/pull/42",
    state: "OPEN",
    isDraft: true,
    viewerCanUpdate: true,
    headRefName: "widgets",
    headRefOid: "a".repeat(40),
    baseRefName: "main",
    baseRefOid: "b".repeat(40),
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    reviewRequests: { nodes: [{ requestedReviewer: null }] },
    latestReviews: {
      nodes: [
        { state: "PENDING", author: null },
        { state: "PENDING", author: { login: "copilot-pull-request-reviewer" } },
      ],
    },
    isInMergeQueue: false,
    mergeQueueEntry: null,
    stack: null,
    stackEntry: null,
    comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    commits: { nodes: [] },
  } as RawSummaryPr;

  const item = await summarizePollSummaryPr(raw, { owner: "acme", name: "widgets" }, {});
  expect(item).toMatchObject({
    action: "wait",
    reasons: ["blocking-reviewer-in-progress"],
    blockingReviewerInProgress: true,
  });
});
