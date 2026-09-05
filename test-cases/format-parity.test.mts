/**
 * CLAUDE.md's "Output format invariant" requires --format=json and --format=text to surface
 * equivalent information, but nothing enforced it end-to-end: the fixtures in index.test.mts
 * snapshot each format independently, so a field added to JSON alone still passes. This walks
 * every string/number leaf of each fixture's lean JSON output and asserts it appears somewhere
 * in the corresponding text output — the two formats were built from the same IterateResult, so
 * a JSON value with no textual trace is either a real gap or a documented, intentional
 * reformatting/omission (see TEXT_LOSSY_PATHS / CONDITIONAL_LOSSY_PATHS in
 * format-parity-helpers.mts).
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
  CONDITIONAL_LOSSY_PATHS,
  normalizeText,
  walkLeaves,
} from "../test-helpers/test-cases/format-parity-helpers.mts";

registerHarnessBefore();

const usedAllowlistPaths = new Set<string>();
const usedConditionalPaths = new Set<string>();

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
        // A path-level allowlist entry that ignores context would hide a real regression on
        // every OTHER value at that path — check the conditional list first, and only fall
        // through to the unconditional TEXT_LOSSY_PATHS allowlist when no conditional entry
        // claims this path.
        const conditional = CONDITIONAL_LOSSY_PATHS.find((c) => c.path === path);
        if (conditional) {
          if (conditional.isExempt(container, json)) {
            usedConditionalPaths.add(path);
            continue;
          }
          failures.push(
            `${path} = ${JSON.stringify(value)} (missing from text, and exemption condition not met: ${conditional.description})`,
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
    const unusedConditional = CONDITIONAL_LOSSY_PATHS.map((c) => c.path).filter(
      (p) => !usedConditionalPaths.has(p),
    );
    expect(
      unusedConditional,
      `CONDITIONAL_LOSSY_PATHS entries no fixture ever exercised — add one that meets the exemption condition, or remove the entry:\n${unusedConditional.join("\n")}`,
    ).toEqual([]);
  });
});
