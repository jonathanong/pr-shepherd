// @ts-nocheck
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  registerHarnessBefore,
  listFixtureNames,
  loadFixture,
  applyFixture,
  captureRun,
  captureTwoTickStallRun,
  assertCrossAgentInvariant,
  stripJsonInstructions,
  type Fixture,
} from "./harness.mts";

registerHarnessBefore();

const __dir = fileURLToPath(new URL(".", import.meta.url));

async function runAgent(fixture: Fixture, runtime: "claude" | "codex") {
  if (runtime === "codex") {
    process.env.AGENT = "codex";
  } else {
    delete process.env.AGENT;
    delete process.env.CODEX_CI;
  }
  applyFixture(fixture);
  const run = fixture.stallMode === "two-tick" ? captureTwoTickStallRun : captureRun;
  const result = await run(fixture);
  delete process.env.AGENT;
  return result;
}

for (const name of listFixtureNames()) {
  describe(name, () => {
    it("snapshots match and invariants hold", async () => {
      const fixture = loadFixture(name);

      const claudeResult = await runAgent(fixture, "claude");
      const codexResult = await runAgent(fixture, "codex");

      // Per-agent text snapshots
      await expect(claudeResult.textOut).toMatchFileSnapshot(
        join(__dir, "snapshots", name, "claude.text.md"),
      );
      await expect(codexResult.textOut).toMatchFileSnapshot(
        join(__dir, "snapshots", name, "codex.text.md"),
      );

      // Lean JSON snapshot (agent-agnostic)
      await expect(claudeResult.jsonOut).toMatchFileSnapshot(
        join(__dir, "snapshots", name, "output.json"),
      );

      // Invariants: JSON data identical across agents (only instructions wording may differ)
      expect(stripJsonInstructions(claudeResult.jsonOut)).toBe(
        stripJsonInstructions(codexResult.jsonOut),
      );
      assertCrossAgentInvariant(claudeResult.textOut, codexResult.textOut);
    });
  });
}
