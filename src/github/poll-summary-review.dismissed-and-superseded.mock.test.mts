import { describe, it, expect } from "vitest";
import { evaluatePollSummaryReview } from "./poll-summary-review.mts";
import { parseRawPr } from "./batch-parsers.mts";
import { makeRawPr } from "../../test-helpers/github/batch-parsers.test-support.mts";

describe("DISMISSED summaries and superseded approvals in parsers and poll summary", () => {
  it("parses non-minimized DISMISSED reviews into reviewSummaries and marks superseded approvals", () => {
    const raw = makeRawPr({
      latestReviews: {
        nodes: [{ author: { __typename: "Bot", login: "coderabbitai" }, state: "DISMISSED" }],
      },
      reviewSummaries: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "PRR_DISMISSED",
            state: "DISMISSED",
            isMinimized: false,
            viewerCanMinimize: true,
            author: { __typename: "Bot", login: "coderabbitai" },
            body: "Actionable comments posted: 3",
            createdAt: "2026-11-28T03:00:00Z",
          },
          {
            id: "PRR_DISMISSED_MINIMIZED",
            state: "DISMISSED",
            isMinimized: true,
            viewerCanMinimize: true,
            author: { __typename: "Bot", login: "jongs-reviewer-bot" },
            body: "Already hidden dismissed review",
            createdAt: "2026-11-28T04:00:00Z",
          },
        ],
      },
      approvedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "PRR_AP_OLD",
            isMinimized: false,
            viewerCanMinimize: true,
            author: { __typename: "Bot", login: "jongs-reviewer-bot" },
            body: "Old approval before dismissed CR",
            createdAt: "2026-11-28T02:00:00Z",
          },
        ],
      },
    });
    const parsed = parseRawPr(
      raw as never,
      [],
      [],
      [],
      raw.reviewSummaries.nodes,
      raw.approvedReviews.nodes,
      [],
    );
    expect(parsed.reviewSummaries.map((r) => r.id)).toEqual(["PRR_DISMISSED"]);
    expect(parsed.supersededApprovalIds).toEqual(["PRR_AP_OLD"]);
  });

  it("counts unblocked DISMISSED summaries and superseded approvals in evaluatePollSummaryReview", async () => {
    const raw = {
      id: "PR_1",
      number: 42,
      title: "test",
      url: "https://github.com/owner/repo/pull/42",
      state: "OPEN",
      isDraft: false,
      headRefName: "feat",
      headRefOid: "abc",
      baseRefName: "main",
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: null,
      comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
      reviews: {
        totalCount: 3,
        pageInfo: { hasPreviousPage: false },
        nodes: [
          {
            id: "PRR_AP_1",
            state: "APPROVED",
            body: "LGTM 1",
            isMinimized: false,
            viewerCanMinimize: true,
            author: { __typename: "Bot", login: "coderabbitai" },
            createdAt: "2026-11-28T01:00:00Z",
          },
          {
            id: "PRR_AP_2",
            state: "APPROVED",
            body: "LGTM 2",
            isMinimized: false,
            viewerCanMinimize: true,
            author: { __typename: "Bot", login: "coderabbitai" },
            createdAt: "2026-11-28T02:00:00Z",
          },
          {
            id: "PRR_DIS_1",
            state: "DISMISSED",
            body: "Old dismissed review",
            isMinimized: false,
            viewerCanMinimize: true,
            author: { __typename: "Bot", login: "coderabbitai" },
            createdAt: "2026-11-28T01:30:00Z",
          },
        ],
      },
      reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
      commits: { totalCount: 1, nodes: [] },
    } as never;

    const { review } = await evaluatePollSummaryReview(raw, new Map(), true);
    expect(review.actionable).toBe(2);
  });
});
