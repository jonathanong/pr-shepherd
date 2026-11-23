// node --test evals/outcomes/world-checks.test.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCENARIOS } from "./scenarios.mjs";
import {
  MERGE_STATE_NOT_STATED,
  isSinglePrWorld,
  statesMergeState,
  unnamedCheckClaims,
} from "./world-checks.mjs";

describe("unnamedCheckClaims", () => {
  it("flags a result asserted for checks nobody names", () => {
    for (const text of [
      "approved, with checks passed and mergeStateStatus CLEAN",
      "approved, checks passed, mergeStateStatus CLEAN",
      "way. All other checks passed. No reviews",
      "All GitHub Actions\nruns for `c0ffee1` have completed and passed.",
      "the checks failing on `c0ffee1`",
    ])
      assert.ok(unnamedCheckClaims(text).length > 0, text);
  });

  it("accepts a named check, and a log line that only says so", () => {
    for (const text of [
      "approved, check `build` passed, mergeStateStatus CLEAN",
      "Checks on `c0ffee1`: `build` passed.",
      "approved, its six checks (`a`, `b`) passed",
      "The only GitHub Actions run, workflow \"CI\" run 810, completed and passed.",
      "Log:\n  All checks passed\n",
    ])
      assert.deepEqual(unnamedCheckClaims(text), [], text);
  });
});

describe("scenario worlds", () => {
  it("name a check wherever they say checks passed, failed or are pending", () => {
    const bad = SCENARIOS.filter((s) => unnamedCheckClaims(s.world).length > 0).map((s) => s.slug);
    assert.deepEqual(bad, []);
  });

  it("state the PR's merge state, except the single-PR worlds recorded without it", () => {
    const missing = SCENARIOS.filter((s) => isSinglePrWorld(s.world) && !statesMergeState(s.world))
      .map((s) => s.slug)
      .filter((slug) => !MERGE_STATE_NOT_STATED.includes(slug));
    assert.deepEqual(missing, []);
  });

  it("list only worlds that still lack a merge state", () => {
    const stale = MERGE_STATE_NOT_STATED.filter((slug) => {
      const s = SCENARIOS.find((x) => x.slug === slug);
      return !s || !isSinglePrWorld(s.world) || statesMergeState(s.world);
    });
    assert.deepEqual(stale, []);
  });
});
