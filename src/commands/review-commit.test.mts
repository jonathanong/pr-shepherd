import { describe, expect, it } from "vitest";
import { renderReviewCommitTag } from "../cli/list-formatters.mts";
import type { Review } from "../types/github.mts";
import { withHeadOid } from "./review-commit.mts";

const base: Review = { id: "R1", author: "a", authorType: "User", body: "b" };

describe("withHeadOid", () => {
  it("keeps commitOid and adds headOid when the review is on an older commit", () => {
    expect(withHeadOid([{ ...base, commitOid: "old" }], "head")).toEqual([
      { ...base, commitOid: "old", headOid: "head" },
    ]);
  });

  it("drops commitOid when the review is on the head", () => {
    expect(withHeadOid([{ ...base, commitOid: "head" }], "head")).toEqual([base]);
  });

  it("leaves reviews without a commit unchanged", () => {
    expect(withHeadOid([base], "head")).toEqual([base]);
  });
});

describe("renderReviewCommitTag", () => {
  it("renders both SHAs only when both are present", () => {
    expect(renderReviewCommitTag({ commitOid: "old", headOid: "head" })).toBe(
      " [submitted on `old`, head is `head`]",
    );
    expect(renderReviewCommitTag({})).toBe("");
  });
});
