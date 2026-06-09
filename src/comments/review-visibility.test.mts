import { describe, it, expect } from "vitest";
import { classifyChangesRequestedReviewsForDisplay } from "./review-visibility.mts";
import { hashBody, type SeenMarker } from "../state/seen-comments.mts";
import { normalizeBotUsernames } from "./authors.mts";
import type { Review } from "../types.mts";

const NOW = 1_700_000_000;

function mkBot(id: string, body: string): Review {
  return { id, author: "claude", authorType: "Bot", body };
}

function mkHuman(id: string, body: string): Review {
  return { id, author: "alice", authorType: "User", body };
}

function seenMap(entries: Array<[string, string]>): Map<string, SeenMarker> {
  const m = new Map<string, SeenMarker>();
  for (const [id, body] of entries) {
    m.set(id, { seenAt: NOW, bodyHash: hashBody(body), id });
  }
  return m;
}

describe("classifyChangesRequestedReviewsForDisplay", () => {
  const bots = normalizeBotUsernames([]);

  it("renders unseen bot CR with full body and marks it seen", () => {
    const review = mkBot("PRR_a", "first look body");
    const { visible, toMarkSeen } = classifyChangesRequestedReviewsForDisplay(
      [review],
      seenMap([]),
      bots,
    );
    expect(visible).toEqual([review]);
    expect(toMarkSeen).toEqual([review]);
  });

  it("tags seen, unchanged bot CR with staleBotCr and does NOT re-mark seen", () => {
    const review = mkBot("PRR_a", "body");
    const { visible, toMarkSeen } = classifyChangesRequestedReviewsForDisplay(
      [review],
      seenMap([["PRR_a", "body"]]),
      bots,
    );
    expect(visible).toEqual([{ ...review, staleBotCr: true }]);
    expect(toMarkSeen).toEqual([]);
  });

  it("renders an edited bot CR with edited:true and re-marks seen", () => {
    const review = mkBot("PRR_a", "new body");
    const { visible, toMarkSeen } = classifyChangesRequestedReviewsForDisplay(
      [review],
      seenMap([["PRR_a", "old body"]]),
      bots,
    );
    expect(visible).toEqual([{ ...review, edited: true }]);
    expect(toMarkSeen).toEqual([review]);
  });

  it("respects the configured botUsernames override (User-authored login)", () => {
    const review: Review = {
      id: "PRR_b",
      author: "custom-bot",
      authorType: "User",
      body: "body",
    };
    const { visible } = classifyChangesRequestedReviewsForDisplay(
      [review],
      seenMap([["PRR_b", "body"]]),
      normalizeBotUsernames(["custom-bot"]),
    );
    expect(visible).toEqual([{ ...review, staleBotCr: true }]);
  });

  it("suppresses unchanged human CR (standard seen-gate behavior)", () => {
    const review = mkHuman("PRR_h", "body");
    const { visible, toMarkSeen } = classifyChangesRequestedReviewsForDisplay(
      [review],
      seenMap([["PRR_h", "body"]]),
      bots,
    );
    expect(visible).toEqual([]);
    expect(toMarkSeen).toEqual([]);
  });

  it("renders human CR with edited:true when body changed", () => {
    const review = mkHuman("PRR_h", "new body");
    const { visible, toMarkSeen } = classifyChangesRequestedReviewsForDisplay(
      [review],
      seenMap([["PRR_h", "old body"]]),
      bots,
    );
    expect(visible).toEqual([{ ...review, edited: true }]);
    expect(toMarkSeen).toEqual([review]);
  });

  it("renders a new human CR as-is and marks it seen", () => {
    const review = mkHuman("PRR_h", "body");
    const { visible, toMarkSeen } = classifyChangesRequestedReviewsForDisplay(
      [review],
      seenMap([]),
      bots,
    );
    expect(visible).toEqual([review]);
    expect(toMarkSeen).toEqual([review]);
  });
});
