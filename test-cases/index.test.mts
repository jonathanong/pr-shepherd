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

for (const name of listFixtureNames()) {
  describe(name, () => {
    it("snapshots match", async () => {
      const fixture = loadFixture(name);
      applyFixture(fixture);
      const run = fixture.stallMode === "two-tick" ? captureTwoTickStallRun : captureRun;
      const result = await run(fixture);

      expect(result.textOut, "text output must not be empty").toBeTruthy();
      expect(result.jsonOut, "json output must not be empty").toBeTruthy();

      await expect(result.textOut).toMatchFileSnapshot(
        join(fixturesDir, "snapshots", name, "output.text.md"),
      );
      await expect(result.jsonOut).toMatchFileSnapshot(
        join(fixturesDir, "snapshots", name, "output.json"),
      );
    });
  });
}
