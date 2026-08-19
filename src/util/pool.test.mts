import { describe, it, expect } from "vitest";
import { mapPool } from "./pool.mts";

describe("mapPool", () => {
  it("returns an empty array for no items", async () => {
    expect(await mapPool([], 4, async () => 1)).toEqual([]);
  });

  it("preserves order with concurrency greater than length", async () => {
    const result = await mapPool([3, 2, 1], 8, async (n) => n * 2);
    expect(result).toEqual([6, 4, 2]);
  });

  it("runs at most `concurrency` tasks at a time", async () => {
    let inflight = 0;
    let maxInflight = 0;
    const result = await mapPool([1, 2, 3, 4, 5], 2, async (n) => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await Promise.resolve();
      inflight -= 1;
      return n;
    });
    expect(result).toEqual([1, 2, 3, 4, 5]);
    expect(maxInflight).toBeLessThanOrEqual(2);
  });
});
