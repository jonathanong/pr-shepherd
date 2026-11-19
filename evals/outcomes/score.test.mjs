// node --test evals/outcomes/score.test.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computedScore } from "./score.mjs";

const g = (name, weight, passed, scored = true) => ({ name, weight, passed, scored });
const SKILL = g("skill-fired", 1, true, false);

describe("computedScore", () => {
  it("scores an atomic merge 1.0", () => {
    assert.equal(computedScore({ graders: [g("outcome", 3, true), g("atomic", 2, true), SKILL] }), 1);
  });
  it("scores a correct bottom-up merge 0.6", () => {
    assert.equal(
      computedScore({ graders: [g("outcome", 3, true), g("atomic", 2, false), SKILL] }),
      0.6,
    );
  });
  it("scores 0 when outcome fails, even if atomic passes", () => {
    assert.equal(computedScore({ graders: [g("outcome", 3, false), g("atomic", 2, true)] }), 0);
  });
  it("leaves a single-grader scenario unchanged and ignores skill-fired", () => {
    assert.equal(computedScore({ graders: [g("outcome", 1, true), g("skill-fired", 1, false, false)] }), 1);
    assert.equal(computedScore({ graders: [g("outcome", 1, false), SKILL] }), 0);
  });
});
