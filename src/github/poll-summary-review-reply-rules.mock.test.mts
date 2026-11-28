import { describe, expect, it, vi } from "vitest";
import { addPrShepherdMarker } from "../comments/marker.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

vi.mock("../classify/loader.mts", async () => {
  const { default: coderabbitNotices } =
    await import("../classify/standard/coderabbit-notices.mts");
  return {
    loadClassifyRules: vi.fn().mockResolvedValue([
      {
        name: "standard:coderabbit-notices",
        file: "pr-shepherd:standard/coderabbit-notices",
        rule: coderabbitNotices,
      },
    ]),
  };
});

import { evaluatePollSummaryReview } from "./poll-summary-review.mts";

const RATE_LIMIT_REPLY = [
  "### Rate Limit Exceeded",
  "",
  "`@jonathanong` have exceeded the limit for the number of chat messages per hour. Please wait **18 minutes and 14 seconds** before sending another message.",
  "",
  "CodeRabbit didn't process this message and won't process it later. Send it again after **2026-11-28 04:55:42 UTC**.",
  "",
  "You can send 50 chat messages an hour in repositories owned by `jongleberry`. The whole allowance comes back at once each hour, and a burst of messages within a few seconds pauses chat for about a minute. [Chat rate limits](https://docs.coderabbit.ai/guide/chat#chat-rate-limits)",
].join("\n");

const bot = { login: "coderabbitai", __typename: "Bot" };
const user = { login: "jonathanong", __typename: "User" };

function summaryWithThread(
  isResolved: boolean,
  nodes: Array<{ id: string; body: string; author: typeof bot | typeof user }>,
): RawSummaryPr {
  return {
    comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviewThreads: {
      totalCount: 1,
      pageInfo: { hasPreviousPage: false },
      nodes: [
        {
          id: "PRRT_kwDOSaSRXM69AIEk",
          isResolved,
          isOutdated: false,
          path: "src/owned.mts",
          comments: { totalCount: nodes.length, pageInfo: { hasPreviousPage: false }, nodes },
        },
      ],
    },
  } as unknown as RawSummaryPr;
}

describe("evaluatePollSummaryReview — suppressed review-thread replies", () => {
  it("skips a CodeRabbit chat rate-limit reply after a Shepherd marker on a resolved thread", async () => {
    const input = summaryWithThread(true, [
      { id: "PRRC_root", body: "Please preserve this finding", author: bot },
      { id: "PRRC_shepherd", body: addPrShepherdMarker("Fixed in latest commit."), author: user },
      { id: "PRRC_rate_limit", body: RATE_LIMIT_REPLY, author: bot },
    ]);
    const { review } = await evaluatePollSummaryReview(input, new Map(), true);
    expect(review).toEqual({ threads: 1 });
  });

  it("still counts a real reply that arrives after the rate-limit notice", async () => {
    const input = summaryWithThread(true, [
      { id: "PRRC_root", body: "Please preserve this finding", author: bot },
      { id: "PRRC_shepherd", body: addPrShepherdMarker("Fixed in latest commit."), author: user },
      { id: "PRRC_rate_limit", body: RATE_LIMIT_REPLY, author: bot },
      { id: "PRRC_followup", body: "Still misses the empty-array case.", author: bot },
    ]);
    const { review } = await evaluatePollSummaryReview(input, new Map(), true);
    expect(review).toEqual({ threads: 1, actionable: 1 });
  });
});
