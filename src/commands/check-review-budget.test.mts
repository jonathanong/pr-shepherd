import { describe, expect, it } from "vitest";
import { applyReviewOutputBudget, type ReviewOutputBuckets } from "./check-review-budget.mts";
import type { EditedComment, ReviewThread } from "../types.mts";

const thread = (id: string, createdAtUnix: number, reviewId?: string): ReviewThread =>
  ({
    id,
    body: "x".repeat(10),
    createdAtUnix,
    ...(reviewId !== undefined && { reviewId }),
  }) as ReviewThread;

const edited = (id: string, createdAtUnix: number): EditedComment =>
  ({ id, body: "e".repeat(10), createdAtUnix }) as EditedComment;

function buckets(
  activeThreads: ReviewThread[],
  editedComments: EditedComment[],
): ReviewOutputBuckets {
  return {
    changesRequested: { visible: [], toMarkSeen: [] },
    threads: { activeThreads, resolutionOnlyThreads: [], firstLookThreads: [], toMarkSeen: [] },
    comments: { actionable: [], minimizeIds: [], toMarkSeen: [] },
    firstLookComments: [],
    firstLookSummaries: [],
    editedSummaries: [],
    editedComments,
  };
}

describe("applyReviewOutputBudget", () => {
  it("never holds edited comments alone: they all show when every other item fits", () => {
    const input = buckets([thread("t1", 1)], [edited("e1", 2), edited("e2", 3)]);
    const result = applyReviewOutputBudget(input, 15);
    expect(result.rollup).toBeUndefined();
    expect(result.heldThreadReviewIds).toBeUndefined();
    expect(result.buckets).toBe(input);
  });

  it("holds edited comments with other held work and names held threads' parent reviews", () => {
    const input = buckets(
      [thread("t1", 1, "PRR_a"), thread("t2", 2, "PRR_b"), thread("t3", 3)],
      [edited("e1", 4)],
    );
    const result = applyReviewOutputBudget(input, 15);
    expect(result.rollup).toEqual({ shown: 1, total: 4 });
    expect(result.buckets.threads.activeThreads.map((t) => t.id)).toEqual(["t1"]);
    expect(result.buckets.editedComments).toEqual([]);
    expect(result.heldThreadReviewIds).toEqual(["PRR_b"]);
  });

  it("omits heldThreadReviewIds when no held thread has a parent review", () => {
    const input = buckets([thread("t1", 1), thread("t2", 2)], []);
    const result = applyReviewOutputBudget(input, 15);
    expect(result.rollup).toEqual({ shown: 1, total: 2 });
    expect(result.heldThreadReviewIds).toBeUndefined();
  });
});
