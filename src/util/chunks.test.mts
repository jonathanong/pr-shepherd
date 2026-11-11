import { describe, expect, it } from "vitest";
import { chunksOf } from "./chunks.mts";

describe("chunksOf", () => {
  it("splits into consecutive slices of at most size", () => {
    expect(chunksOf([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("returns no chunks for no items", () => {
    expect(chunksOf([], 3)).toEqual([]);
  });
});
