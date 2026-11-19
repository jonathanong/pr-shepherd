import { describe, expect, it } from "vitest";
import { renderReviewCommitTag } from "../cli/list-formatters.mts";
import type { Review } from "../types/github.mts";
import { withHeadOid } from "./review-commit.mts";

const base: Review = { id: "R1", author: "a", authorType: "User", body: "b" };

describe("withHeadOid", () => {
  it("keeps commitOid and adds headOid when the review is on an older commit", () => {
    expect(withHeadOid([{ ...base, commitOid: "1234567890abc" }], "fedcba9876543")).toEqual([
      { ...base, commitOid: "1234567", headOid: "fedcba9" },
    ]);
  });

  it("drops commitOid when the review is on the head", () => {
    expect(withHeadOid([{ ...base, commitOid: "head" }], "head")).toEqual([base]);
  });

  it("leaves reviews without a commit unchanged", () => {
    expect(withHeadOid([base], "head")).toEqual([base]);
  });
});

describe("commitsSince", () => {
  it("is kept with the head when the review is on an older commit", () => {
    expect(withHeadOid([{ ...base, commitOid: "old", commitsSince: 1 }], "head")).toEqual([
      { ...base, commitOid: "old", headOid: "head", commitsSince: 1 },
    ]);
  });

  it("is dropped when the review is on the head", () => {
    expect(withHeadOid([{ ...base, commitOid: "head", commitsSince: 0 }], "head")).toEqual([base]);
  });
});

describe("renderReviewCommitTag", () => {
  it("renders both short SHAs only when both are present", () => {
    expect(renderReviewCommitTag({ commitOid: "a1b2c3d", headOid: "c0ffee1" })).toBe(
      " [reviewed `a1b2c3d`, head `c0ffee1`]",
    );
    expect(renderReviewCommitTag({})).toBe("");
  });

  it("adds the commit count, singular or plural, when known", () => {
    const sha = { commitOid: "a1b2c3d", headOid: "c0ffee1" };
    expect(renderReviewCommitTag({ ...sha, commitsSince: 1 })).toBe(
      " [reviewed `a1b2c3d`, head `c0ffee1`, 1 commit since]",
    );
    expect(renderReviewCommitTag({ ...sha, commitsSince: 3 })).toContain(", 3 commits since]");
  });
});
