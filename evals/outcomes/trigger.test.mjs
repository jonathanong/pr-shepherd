// node --test evals/outcomes/trigger.test.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCENARIOS } from "./scenarios.mjs";
import { maySkipCli, skillFired, triggerLine } from "./trigger.mjs";
import { systemText } from "./write.mjs";

describe("trigger helpers", () => {
  it("exempts create and trigger scenarios from the CLI-called check", () => {
    assert.equal(maySkipCli({ tags: ["trigger"] }), true);
    assert.equal(maySkipCli({ tags: ["create"] }), true);
    assert.equal(maySkipCli({ tags: ["ci"] }), false);
    assert.equal(maySkipCli({}), false);
  });

  it("reads the skill-fired grader", () => {
    assert.equal(skillFired({ graders: [{ name: "skill-fired", passed: true }] }), true);
    assert.equal(skillFired({ graders: [{ name: "skill-fired", score: 0 }] }), false);
    assert.equal(skillFired({ graders: [{ name: "outcome", passed: true }] }), false);
    assert.equal(skillFired({}), false);
  });

  it("summarizes kept runs", () => {
    const line = triggerLine("69-x", [
      { fired: true, cliCalls: 2 },
      { fired: false, cliCalls: 0 },
      { fired: false, cliCalls: 1 },
    ]);
    assert.equal(line, "trigger `69-x`: skill loaded in 1 of 3 kept plugin runs, CLI called in 2 of 3");
  });
});

describe("skillHint", () => {
  it("keeps the skill sentence by default and drops it when false", () => {
    assert.match(systemText({}), /You MAY use any skill/);
    assert.doesNotMatch(systemText({ skillHint: false }), /skill/i);
  });

  it("tells the agent the tools answer from a snapshot", () => {
    assert.match(systemText({}), /snapshot taken before this pass/);
  });

  it("gives every trigger scenario the exact merge prompt and no hint", () => {
    const triggers = SCENARIOS.filter((s) => s.tags.includes("trigger"));
    assert.equal(triggers.length, 3);
    for (const s of triggers) {
      assert.equal(s.skillHint, false);
      assert.equal(s.prompt, "Merge https://github.com/owner/repo/pull/42.");
      assert.equal(s.category, "Trigger (no skill hint)");
    }
  });
});
