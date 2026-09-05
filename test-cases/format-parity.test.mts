/**
 * CLAUDE.md's "Output format invariant" requires --format=json and --format=text to surface
 * equivalent information, but nothing enforced it end-to-end: the fixtures in index.test.mts
 * snapshot each format independently, so a field added to JSON alone still passes. This walks
 * every string/number leaf of each fixture's lean JSON output and asserts it appears somewhere
 * in the corresponding text output — the two formats were built from the same IterateResult, so
 * a JSON value with no textual trace is either a real gap or a documented, intentional
 * reformatting/omission (see TEXT_LOSSY_PATHS in format-parity-helpers.mts).
 *
 * Boolean leaves are excluded: "true"/"false" are common enough as substrings that a literal
 * match is not a meaningful signal (and lean JSON already omits most boolean fields at their
 * trivial default, per docs/actions.md's lean-mode rules, so there is little left to check).
 */
import { describe, it, expect, afterAll } from "vitest";
import {
  registerHarnessBefore,
  listFixtureNames,
  loadFixture,
  applyFixture,
  captureRun,
  captureTwoTickStallRun,
} from "../test-helpers/test-cases/harness.mts";
import {
  TEXT_LOSSY_PATHS,
  normalizeText,
  walkLeaves,
} from "../test-helpers/test-cases/format-parity-helpers.mts";

registerHarnessBefore();

const usedAllowlistPaths = new Set<string>();
let staleBotCrEscapeHatchUsed = false;

describe("text/json output parity", () => {
  for (const name of listFixtureNames()) {
    it(`${name}: every JSON leaf appears in text, or is in TEXT_LOSSY_PATHS`, async () => {
      const fixture = loadFixture(name);
      applyFixture(fixture);
      const run = fixture.stallMode === "two-tick" ? captureTwoTickStallRun : captureRun;
      const result = await run(fixture);
      const json = JSON.parse(result.jsonOut);
      const text = normalizeText(result.textOut);

      const failures: string[] = [];
      for (const [path, value, container] of walkLeaves(json, "")) {
        if (value.length === 0) continue;
        if (text.includes(value)) continue;
        // A stale bot CR (staleBotCr: true) keeps its full body in JSON for API consumers, but
        // text intentionally renders only a terse one-line dismissal reminder on resurfacing
        // ticks (fix-formatter.mts). Scoped to that specific review, not the whole path — a
        // human or first-look bot review missing its body here is the exact regression this
        // test exists to catch, not an allowlisted gap.
        if (path === "fix.changesRequestedReviews[].body") {
          const isStaleBotCr =
            typeof container === "object" &&
            container !== null &&
            (container as { staleBotCr?: boolean }).staleBotCr === true;
          if (isStaleBotCr) {
            staleBotCrEscapeHatchUsed = true;
            continue;
          }
          failures.push(
            `${path} = ${JSON.stringify(value)} (missing from text, and this review is not staleBotCr — its full body must render)`,
          );
          continue;
        }
        if (TEXT_LOSSY_PATHS.has(path)) {
          usedAllowlistPaths.add(path);
          continue;
        }
        failures.push(`${path} = ${JSON.stringify(value)}`);
      }
      expect(
        failures,
        `JSON-only value(s) with no trace in text output — either render them, or add a ` +
          `justified entry to TEXT_LOSSY_PATHS in format-parity-helpers.mts:\n${failures.join("\n")}`,
      ).toEqual([]);

      // docs/actions.md: "The block after the base-fields line ... is escalate.humanMessage in
      // JSON — ready to print verbatim." Checked directly (unnormalized) rather than through
      // the leaf walker above.
      if (json.action === "escalate") {
        expect(result.textOut.includes(json.escalate.humanMessage)).toBe(true);
      }
    });
  }

  afterAll(() => {
    const unused = [...TEXT_LOSSY_PATHS.keys()].filter((p) => !usedAllowlistPaths.has(p));
    expect(
      unused,
      `TEXT_LOSSY_PATHS entries no fixture ever needed — remove them, they no longer document a real gap:\n${unused.join("\n")}`,
    ).toEqual([]);
    expect(
      staleBotCrEscapeHatchUsed,
      "no fixture ever exercised the fix.changesRequestedReviews[].body staleBotCr escape hatch — add one (or remove the special case) so it stays a real, tested gap",
    ).toBe(true);
  });
});
