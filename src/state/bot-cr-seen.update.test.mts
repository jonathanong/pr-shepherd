import { describe, it, expect } from "vitest";
import { updateBotCrSeenState } from "./bot-cr-seen.mts";
import { hashBody } from "./seen-comments.mts";

const NOW = 1_700_000_000;
const HOUR = 3_600;

describe("updateBotCrSeenState", () => {
  it("inserts new IDs with firstSeenAt = now and the current body hash", () => {
    const { next, staleIds } = updateBotCrSeenState(
      null,
      [{ id: "PRR_a", body: "hello" }],
      NOW,
      HOUR,
    );
    expect(next.reviews["PRR_a"]).toEqual({ firstSeenAt: NOW, bodyHash: hashBody("hello") });
    expect(staleIds).toEqual([]);
  });

  it("preserves firstSeenAt when the body hash is unchanged", () => {
    const prior = { reviews: { PRR_a: { firstSeenAt: NOW - 60, bodyHash: hashBody("hello") } } };
    const { next } = updateBotCrSeenState(prior, [{ id: "PRR_a", body: "hello" }], NOW, HOUR);
    expect(next.reviews["PRR_a"].firstSeenAt).toBe(NOW - 60);
  });

  it("resets firstSeenAt when the body hash changes", () => {
    const prior = { reviews: { PRR_a: { firstSeenAt: NOW - HOUR * 2, bodyHash: "old" } } };
    const { next, staleIds } = updateBotCrSeenState(
      prior,
      [{ id: "PRR_a", body: "edited" }],
      NOW,
      HOUR,
    );
    expect(next.reviews["PRR_a"].firstSeenAt).toBe(NOW);
    expect(next.reviews["PRR_a"].bodyHash).toBe(hashBody("edited"));
    expect(staleIds).toEqual([]);
  });

  it("drops entries that are no longer in the current set", () => {
    const prior = { reviews: { PRR_old: { firstSeenAt: NOW, bodyHash: "h" } } };
    const { next } = updateBotCrSeenState(prior, [], NOW, HOUR);
    expect(next.reviews).toEqual({});
  });

  it("reports staleIds for entries past the threshold", () => {
    const prior = {
      reviews: {
        PRR_old: { firstSeenAt: NOW - HOUR - 1, bodyHash: hashBody("body") },
        PRR_new: { firstSeenAt: NOW - 1, bodyHash: hashBody("fresh") },
      },
    };
    const { staleIds } = updateBotCrSeenState(
      prior,
      [
        { id: "PRR_old", body: "body" },
        { id: "PRR_new", body: "fresh" },
      ],
      NOW,
      HOUR,
    );
    expect(staleIds).toEqual(["PRR_old"]);
  });

  it("does not report staleIds when timeout is zero (disabled)", () => {
    const prior = {
      reviews: { PRR_old: { firstSeenAt: NOW - HOUR * 10, bodyHash: hashBody("body") } },
    };
    const { staleIds } = updateBotCrSeenState(prior, [{ id: "PRR_old", body: "body" }], NOW, 0);
    expect(staleIds).toEqual([]);
  });
});
