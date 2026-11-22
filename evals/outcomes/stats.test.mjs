import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupBootstrapDeltas, interval, seedOf } from "../stats.mjs";

const scenario = (w, wo) => ({ with: w, without: wo });
const width = (draws) => {
  const [lo, hi] = interval(draws);
  return hi - lo;
};

describe("groupBootstrapDeltas", () => {
  it("is deterministic for a seed", () => {
    const group = [scenario([1, 1, 1], [0, 0, 0]), scenario([1, 1, 1], [1, 1, 1])];
    assert.deepEqual(groupBootstrapDeltas(group, 7), groupBootstrapDeltas(group, 7));
  });

  it("is wider than a runs-only resample when scenarios differ", () => {
    // Every run is constant, so resampling runs alone adds no width. The scenario
    // sample is what varies: 3/3 against 0/3 in one, no change in the other.
    const group = [scenario([1, 1, 1], [0, 0, 0]), scenario([1, 1, 1], [1, 1, 1])];
    const draws = groupBootstrapDeltas(group, seedOf("group"));
    assert.ok(width(draws) > 0.4);
    assert.ok(draws.every((d) => d >= 0 && d <= 1));
  });

  it("has no width when every scenario agrees", () => {
    const group = [scenario([1, 1], [0, 0]), scenario([1, 1], [0, 0])];
    assert.equal(width(groupBootstrapDeltas(group, 1)), 0);
  });

  it("returns null for an empty group or an arm with fewer than two runs", () => {
    assert.equal(groupBootstrapDeltas([], 1), null);
    assert.equal(groupBootstrapDeltas([scenario([1], [0, 0])], 1), null);
  });
});
