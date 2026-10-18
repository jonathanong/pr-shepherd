import { describe, it, expect } from "vitest";
import { selectReviewOutput, type BudgetItem } from "./review-output-budget.mts";

const item = (id: string, cost: number, createdAtUnix?: number): BudgetItem => ({
  id,
  cost,
  ...(createdAtUnix !== undefined && { createdAtUnix }),
});

describe("selectReviewOutput", () => {
  it("keeps everything with no rollup when the total fits", () => {
    const sel = selectReviewOutput([[item("a", 10)], [item("b", 10)]], 20);
    expect(sel.rollup).toBeUndefined();
    expect(sel.keep("a")).toBe(true);
    expect(sel.keep("b")).toBe(true);
  });

  it("treats 0 as unlimited", () => {
    const sel = selectReviewOutput([[item("a", 1_000_000)]], 0);
    expect(sel.rollup).toBeUndefined();
    expect(sel.keep("a")).toBe(true);
  });

  it("takes groups in priority order, oldest first within a group", () => {
    const sel = selectReviewOutput(
      [
        [item("cr-new", 10, 200), item("cr-old", 10, 100)],
        [item("thread", 10, 50)],
        [item("first", 10, 1)],
      ],
      25,
    );
    expect(sel.rollup).toEqual({ shown: 2, total: 4 });
    expect(sel.keep("cr-old")).toBe(true);
    expect(sel.keep("cr-new")).toBe(true);
    expect(sel.keep("thread")).toBe(false);
    expect(sel.keep("first")).toBe(false);
  });

  it("sorts unknown ages last and stops at the first item that does not fit", () => {
    const sel = selectReviewOutput(
      [[item("unknown", 5), item("old", 5, 1), item("big", 50, 2)]],
      20,
    );
    expect(sel.keep("old")).toBe(true);
    expect(sel.keep("big")).toBe(false);
    // Stops at "big" rather than skipping ahead to the smaller unknown-age item.
    expect(sel.keep("unknown")).toBe(false);
    expect(sel.rollup).toEqual({ shown: 1, total: 3 });
  });

  it("always shows at least one item", () => {
    const sel = selectReviewOutput([[item("huge", 500, 1), item("next", 1, 2)]], 10);
    expect(sel.keep("huge")).toBe(true);
    expect(sel.keep("next")).toBe(false);
    expect(sel.rollup).toEqual({ shown: 1, total: 2 });
  });

  it("charges an ID once, in its first group, and keeps unbudgeted IDs", () => {
    const sel = selectReviewOutput([[item("t", 10, 1)], [item("t", 10, 1), item("u", 10, 2)]], 15);
    expect(sel.rollup).toEqual({ shown: 1, total: 2 });
    expect(sel.keep("t")).toBe(true);
    expect(sel.keep("u")).toBe(false);
    expect(sel.keep("not-budgeted")).toBe(true);
  });
});
