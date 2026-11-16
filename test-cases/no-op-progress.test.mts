import { describe, it, expect } from "vitest";

import {
  registerHarnessBefore,
  listFixtureNames,
  loadFixture,
  fixtureTransports,
} from "../test-helpers/test-cases/harness.mts";
import { runNoOpAgent } from "../test-helpers/test-cases/no-op-agent.mts";
import { generatedChecks } from "../test-helpers/test-cases/no-op-generated.mts";
import { allowlistReason } from "./no-op-allowlist.mts";

registerHarnessBefore();

/**
 * Progress invariant: when the caller has nothing to change (no push, no code edit) and only runs
 * the review mutations and reruns the CLI generated, the next tick on the same head must not be
 * a `triage` with the same actionable content. Otherwise the caller loops instead of waiting.
 */
function assertProgress(name: string, run: Awaited<ReturnType<typeof runNoOpAgent>>): void {
  const allowed = allowlistReason(name);
  const sequence = run.actions.join(" > ");
  if (allowed) {
    expect(run.repeatedAt, `${name} is allowlisted (${allowed}) but no longer repeats`).not.toBe(0);
  } else {
    expect(
      run.repeatedAt,
      `${name} repeats identical triage on tick ${run.repeatedAt}: ${sequence}`,
    ).toBe(0);
  }
}

describe("no-op agent progress: fixtures", () => {
  let triageFixtures = 0;
  for (const name of listFixtureNames()) {
    const fixture = loadFixture(name);
    if (fixture.mode === "aggregate" || fixture.stallMode) continue;
    if (!fixtureTransports(fixture).includes("graphql")) continue;
    if (!name.replace(/^\d+-/, "").startsWith("triage-")) continue;
    triageFixtures += 1;
    it(name, async () => assertProgress(name, await runNoOpAgent(fixture)));
  }
  it("covers the triage fixtures", () => expect(triageFixtures).toBeGreaterThan(80));
});

describe("no-op agent progress: generated check states", () => {
  const cases = generatedChecks();
  it("is a bounded matrix", () => expect(cases.length).toBeLessThan(200));
  for (const { name, fixture } of cases) {
    it(name, async () => assertProgress(name, await runNoOpAgent(fixture)));
  }
});
