import { describe, expect, it, vi } from "vitest";
import type { ClassifyItem } from "../classify/types.mts";

vi.mock("../classify/loader.mts", () => ({
  loadClassifyRules: vi.fn().mockResolvedValue([
    {
      name: "test-rule",
      file: "test-rule.mjs",
      rule: (item: ClassifyItem) => {
        if (item.body === "hide") return { suppress: true };
        if (item.body === "minimize") return { suppress: true, autoResolve: true };
        return null;
      },
    },
  ]),
}));

import { summarizePollSummaryReview } from "./poll-summary-review.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import { hashBody, type SeenMarker } from "../state/seen-comments.mts";

const bot = { login: "noise-bot", __typename: "Bot" };

function raw(bodies: string[]): RawSummaryPr {
  return {
    comments: {
      totalCount: bodies.length,
      pageInfo: { hasPreviousPage: false },
      nodes: bodies.map((body, i) => ({ id: `c${i}`, body, isMinimized: false, author: bot })),
    },
    reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
  } as unknown as RawSummaryPr;
}

describe("summarizePollSummaryReview — classification rules", () => {
  it("hides suppress-only matches but keeps unseen auto-resolve matches for the full check", async () => {
    const review = await summarizePollSummaryReview(raw(["hide", "minimize"]), new Map(), true);
    expect(review).toEqual({ comments: 2, actionable: 1 });
  });

  it("drops an auto-resolve match once the full check has surfaced it", async () => {
    const seen = new Map<string, SeenMarker>([
      ["c0", { seenAt: 1, bodyHash: hashBody("minimize") }],
    ]);
    expect(await summarizePollSummaryReview(raw(["minimize"]), seen, true)).toEqual({
      comments: 1,
    });
  });
});

describe("auto-resolution evidence for compact thread certification", () => {
  it("accepts only a complete resolved auto-resolve match", async () => {
    for (const [isResolved, truncated, expected] of [
      [true, false, undefined],
      [false, false, 1],
      [undefined, false, 1],
      [true, true, 1],
    ] as const) {
      const input = raw([]);
      input.reviewThreads = {
        totalCount: 1,
        pageInfo: { hasPreviousPage: false },
        nodes: [
          {
            id: "thread-auto-resolve",
            isResolved,
            isOutdated: false,
            path: "src/example.mts",
            comments: {
              totalCount: 1,
              pageInfo: { hasPreviousPage: truncated },
              nodes: [
                { id: "comment-auto-resolve", body: "minimize", author: bot, isMinimized: false },
              ],
            },
          },
        ],
      } as RawSummaryPr["reviewThreads"];
      const result = await summarizePollSummaryReview(input, new Map(), true);
      expect(result.actionable).toBe(expected);
      expect(result.incomplete).toBe(truncated ? true : undefined);
    }
  });
});
