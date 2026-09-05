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
} from "../test-helpers/test-cases/harness.mts";

registerHarnessBefore();

const fixturesDir = fileURLToPath(new URL("./", import.meta.url));

/**
 * The action slug encoded in a fixture's directory name (e.g. "16-fix-code-review-thread" ->
 * "fix_code") must match the action iterate actually emits. Without this guard a fixture can
 * silently drift from what its name promises — see the three fixtures documented in
 * test-cases/README.md that this guard would have caught.
 */
const NAME_ACTION_SLUGS: ReadonlyArray<[prefix: string, action: string]> = [
  ["fix-code-", "fix_code"],
  ["mark-ready-", "mark_ready"],
  ["cancel-", "cancel"],
  ["wait-", "wait"],
  ["escalate-", "escalate"],
  ["merge-", "merge"],
];

function actionFromFixtureName(name: string): string {
  const rest = name.replace(/^\d+-/, "");
  const match = NAME_ACTION_SLUGS.find(([prefix]) => rest.startsWith(prefix));
  if (!match) {
    throw new Error(`fixture name "${name}" does not start with a known action slug`);
  }
  return match[1];
}

for (const name of listFixtureNames()) {
  describe(name, () => {
    it("snapshots match", async () => {
      const fixture = loadFixture(name);
      applyFixture(fixture);
      const run = fixture.stallMode === "two-tick" ? captureTwoTickStallRun : captureRun;
      const result = await run(fixture);

      expect(result.textOut, "text output must not be empty").toBeTruthy();
      expect(result.jsonOut, "json output must not be empty").toBeTruthy();
      expect(result.jsonExitCode, "text and json exit codes must agree").toBe(result.exitCode);
      expect(result.exitCode, "exit code must match docs/exit-codes.md").toBe(
        fixture.expectedExitCode,
      );
      const actualAction = (JSON.parse(result.jsonOut) as { action: string }).action;
      expect(actualAction, `fixture name must match the emitted action`).toBe(
        actionFromFixtureName(name),
      );

      await expect(result.textOut).toMatchFileSnapshot(
        join(fixturesDir, "snapshots", name, "output.text.md"),
      );
      await expect(result.jsonOut).toMatchFileSnapshot(
        join(fixturesDir, "snapshots", name, "output.json"),
      );
    });
  });
}
