/**
 * CLAUDE.md's "Output format invariant" requires --format=json and --format=text to surface
 * equivalent information, but nothing enforced it end-to-end: the fixtures in index.test.mts
 * snapshot each format independently, so a field added to JSON alone still passes. This walks
 * every string/number leaf of each fixture's lean JSON output and asserts it appears somewhere
 * in the corresponding text output — the two formats were built from the same IterateResult, so
 * a JSON value with no textual trace is either a real gap or a documented, intentional
 * reformatting/omission (see TEXT_LOSSY_PATHS below).
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

registerHarnessBefore();

/**
 * Paths (dot-separated; array indices collapsed to "[]") whose JSON leaf value is legitimately
 * absent from the rendered text, with the specific reformatting or scope rule that explains it.
 * Every entry here is asserted (see the afterAll below) to actually be needed by at least one
 * fixture — an entry nothing ever hits is dead weight and fails on its own.
 */
const TEXT_LOSSY_PATHS = new Map<string, string>([
  ["action", "text uses the uppercase `[ACTION]` heading tag, not the lowercase JSON enum value"],
  [
    "baseBranch",
    "only rendered under --verbose (`**baseBranch**`) or fix_code's `base:` bullet — omitted from lean text for every other action",
  ],
  [
    "mergeStatus",
    "the raw enum discriminator is JSON-only; text instead renders the derived `**branch** behind/conflicts with PR base` phrasing or the `**reviewDecision**`/BLOCKED header segment (docs/actions.md, 'Note on mergeStatus in JSON lean mode')",
  ],
  ["mergeRequirements.approvals.current", "rendered as `None` when 0, not the digit"],
  [
    "mergeRequirements.approvals.requiredCount",
    "rendered as `Not Required`/omitted when 0, not the digit",
  ],
  [
    "mergeRequirements.conversationsResolved.unresolvedCount",
    "rendered as `Yes`/`No`, not the digit",
  ],
  [
    "inProgressChecks[].runId",
    "the `**activity** active: ...` line names in-progress checks, it does not link their run IDs",
  ],
  ["inProgressChecks[].detailsUrl", "same — the activity line is names only"],
  [
    "inProgressChecks[].status",
    "same — the activity line is names only, not the raw GraphQL status",
  ],
  [
    "checks[].name",
    "`## Checks` / `## Failing checks` reconstruct `workflowName › jobName`; the raw `name` field (`workflow / job`) is never printed verbatim",
  ],
  ["fix.checks[].name", "same reformat as checks[].name"],
  ["escalate.checks[].name", "same reformat as checks[].name"],
  [
    "checks[].detailsUrl",
    "a GitHub Actions check shows only its run ID; a URL is printed only for an external (no-runId) check",
  ],
  ["fix.checks[].detailsUrl", "same as checks[].detailsUrl"],
  [
    "escalate.stalledChecks[].detailsUrl",
    "same as checks[].detailsUrl — shown only for the external/status_context stalled check, not a GitHub Actions one",
  ],
  [
    "checks[].conclusion",
    "the raw `checks[]` array includes passing checks; lean text surfaces passing checks only via the summary count, never per-check",
  ],
  ["checks[].runId", "same — passing-check detail is never printed in lean text"],
  [
    "fix.resolutionOnlyThreads[].createdAtUnix",
    "raw bookkeeping timestamp on the thread's top comment; never rendered as a date",
  ],
  ["fix.firstLookThreads[].createdAtUnix", "same"],
  ["fix.firstLookThreads[].comments[].createdAtUnix", "same, for transcript replies"],
  [
    "escalate.stalledChecks[].createdAtUnix",
    "rendered as a relative 'waiting N minutes' duration, not a raw timestamp",
  ],
  ["escalate.stalledChecks[].updatedAtUnix", "same"],
  [
    "escalate.stalledChecks[].ageSeconds",
    "same — the duration is reformatted to whatever unit reads best (docs/actions.md)",
  ],
  [
    "fix.resolveCommand.argv[]",
    "JSON always carries the structured command object for programmatic callers; Markdown prints the assembled `apply review:` bullet only when hasMutations is true",
  ],
  [
    "escalate.unresolvedThreads[].url",
    "the escalate 'Items needing attention' bullet omits the thread URL (id + location + author + body only)",
  ],
  [
    "fix.changesRequestedReviews[].body",
    "a stale bot CR (staleBotCr: true) keeps its full body in JSON for API consumers, but text intentionally renders only a terse one-line dismissal reminder on resurfacing ticks",
  ],
  [
    "escalate.authorization[].reason",
    "the raw enum (denied-or-unverifiable) is paraphrased into a human sentence under `## Authorization`",
  ],
  [
    "reviewDecision",
    "only appended to the header when the derived mergeStatus is BLOCKED (docs/actions.md); the raw GitHub field is otherwise JSON-only",
  ],
]);

function normalizeText(text: string): string {
  // Strip Markdown blockquote markers regardless of nesting indent (e.g. "  > line" inside a
  // list item), so a multi-line body still substring-matches its raw JSON form.
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*>\s?/, ""))
    .join("\n");
}

function* walkLeaves(value: unknown, path: string): Generator<[string, string]> {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) yield* walkLeaves(item, `${path}[]`);
    return;
  }
  if (typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      // escalate.humanMessage is pre-rendered Markdown (blockquote markers and all) that is
      // supposed to be spliced verbatim into the text — checked separately, unnormalized,
      // below. Normalizing the surrounding text (for every other leaf's benefit) would make
      // this one legitimately-verbatim field look like a mismatch.
      if (childPath === "escalate.humanMessage") continue;
      yield* walkLeaves(v, childPath);
    }
    return;
  }
  if (typeof value === "string" || typeof value === "number") {
    yield [path, String(value)];
  }
}

const usedAllowlistPaths = new Set<string>();

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
      for (const [path, value] of walkLeaves(json, "")) {
        if (value.length === 0) continue;
        if (text.includes(value)) continue;
        if (TEXT_LOSSY_PATHS.has(path)) {
          usedAllowlistPaths.add(path);
          continue;
        }
        failures.push(`${path} = ${JSON.stringify(value)}`);
      }
      expect(
        failures,
        `JSON-only value(s) with no trace in text output — either render them, or add a ` +
          `justified entry to TEXT_LOSSY_PATHS in this file:\n${failures.join("\n")}`,
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
  });
});
