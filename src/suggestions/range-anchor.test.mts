import { describe, expect, it } from "vitest";
import { findLineSequenceOffsets } from "./range-anchor.mts";

describe("findLineSequenceOffsets", () => {
  it("returns no offsets for an empty sequence", () => {
    expect(findLineSequenceOffsets(["a"], [])).toEqual([]);
  });

  it("finds overlapping occurrences", () => {
    expect(findLineSequenceOffsets(["anchor", "anchor", "anchor"], ["anchor", "anchor"])).toEqual([
      0, 1,
    ]);
  });

  it("falls back through partial matches", () => {
    expect(findLineSequenceOffsets(["a", "b", "a", "b", "a", "c"], ["a", "b", "a", "c"])).toEqual([
      2,
    ]);
  });

  it("normalizes CRLF line endings", () => {
    expect(findLineSequenceOffsets(["before", "anchor\r", "after"], ["anchor"])).toEqual([1]);
  });
});
