import { describe, expect, it } from "vitest";
import type { BatchPartition } from "../classify/apply.mts";
import type { PrActivitySummary, ReviewActivityItem } from "../types.mts";
import { filterSuppressedActivity } from "./check-activity.mts";

const item = (
  kind: ReviewActivityItem["kind"],
  id: string,
  extra: Partial<ReviewActivityItem> = {},
): ReviewActivityItem => ({
  kind,
  id,
  author: "bot",
  authorType: "Bot",
  body: id,
  createdAtUnix: 1,
  ...extra,
});

const partition = {
  suppressedCommentIds: new Set(["c1", "c-denied"]),
  suppressedThreadIds: new Set(["t1"]),
  suppressedReviewSummaryIds: new Set(["s1"]),
  suppressedChangesRequestedIds: new Set(["cr1"]),
} as unknown as BatchPartition;

const activity: PrActivitySummary = {
  commitCount: 2,
  reviewRoundCount: 4,
  latestCommitCommittedAtUnix: 0,
  reviewItemsSinceLatestCommit: [
    item("pr-comment", "c1"),
    item("pr-comment", "c-denied"),
    item("pr-comment", "c2"),
    item("review-thread-comment", "tc1", { threadId: "t1" }),
    item("review-thread-comment", "tc2", { threadId: "t2" }),
    item("review-thread-comment", "tc3"),
    item("review-summary", "s1"),
    item("review-summary", "s2"),
    item("changes-requested-review", "cr1"),
    item("changes-requested-review", "cr2"),
    item("approved-review", "a1"),
  ],
};

describe("filterSuppressedActivity", () => {
  it("returns undefined activity unchanged", () => {
    expect(filterSuppressedActivity(undefined, partition, [])).toBeUndefined();
  });

  it("drops rule-suppressed items, keeps denied ones, and leaves rounds alone", () => {
    const out = filterSuppressedActivity(activity, partition, ["c-denied"]);
    expect(out?.reviewItemsSinceLatestCommit.map((i) => i.id)).toEqual([
      "c-denied",
      "c2",
      "tc2",
      "tc3",
      "s2",
      "cr2",
      "a1",
    ]);
    expect(out).toMatchObject({ commitCount: 2, reviewRoundCount: 4 });
  });
});
