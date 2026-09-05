/**
 * Shared helpers for test-cases/format-parity.test.mts — split out to stay under the repo's
 * 200-line-per-file cap. See that file for the invariant this enforces.
 */

/**
 * Paths (dot-separated; array indices collapsed to "[]") whose JSON leaf value is legitimately
 * absent from the rendered text, with the specific reformatting or scope rule that explains it.
 * Every entry here is asserted (see the afterAll in format-parity.test.mts) to actually be needed
 * by at least one fixture — an entry nothing ever hits is dead weight and fails on its own.
 */
export const TEXT_LOSSY_PATHS = new Map<string, string>([
  ["action", "text uses the uppercase `[ACTION]` heading tag, not the lowercase JSON enum value"],
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
    "escalate.authorization[].reason",
    "the raw enum (denied-or-unverifiable) is paraphrased into a human sentence under `## Authorization`",
  ],
  [
    "reviewDecision",
    "only appended to the header when the derived mergeStatus is BLOCKED (docs/actions.md); the raw GitHub field is otherwise JSON-only",
  ],
]);

/**
 * A path-level entry in TEXT_LOSSY_PATHS is unconditional: any miss at that path is exempt,
 * regardless of context. Some legitimate omissions only hold under a specific condition (a
 * sibling field, or the top-level action) — encoding those as an unconditional path entry would
 * hide a real regression on every OTHER value at that same path. isExempt receives the leaf's
 * immediate containing object and the full parsed JSON so it can check either.
 */
export interface ConditionalLossyPath {
  path: string;
  description: string;
  isExempt: (container: unknown, json: unknown) => boolean;
}

export const CONDITIONAL_LOSSY_PATHS: ConditionalLossyPath[] = [
  {
    path: "fix.changesRequestedReviews[].body",
    description:
      "a stale bot CR (staleBotCr: true) keeps its full body in JSON for API consumers, but text intentionally renders only a terse one-line dismissal reminder on resurfacing ticks (fix-formatter.mts) — every other review (human, or a bot CR's first emission) must render its full body",
    isExempt: (container) =>
      typeof container === "object" &&
      container !== null &&
      (container as { staleBotCr?: boolean }).staleBotCr === true,
  },
  {
    path: "baseBranch",
    description:
      "rendered under --verbose (`**baseBranch**`) or fix_code's unconditional `- base:` bullet — omitted from lean text for every other action, which is the only case this exemption may cover",
    isExempt: (_container, json) => (json as { action?: string }).action !== "fix_code",
  },
];

export function normalizeText(text: string): string {
  // Strip Markdown blockquote markers regardless of nesting indent (e.g. "  > line" inside a
  // list item), so a multi-line body still substring-matches its raw JSON form.
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*>\s?/, ""))
    .join("\n");
}

// The third tuple element is the leaf's immediate containing object (or array, for a scalar
// array item) — needed so a path-level allowlist entry can be conditioned on a sibling field
// (see the fix.changesRequestedReviews[].body handling in format-parity.test.mts), not just on
// the path string.
export function* walkLeaves(
  value: unknown,
  path: string,
  container?: unknown,
): Generator<[string, string, unknown]> {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) yield* walkLeaves(item, `${path}[]`, value);
    return;
  }
  if (typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      // escalate.humanMessage is pre-rendered Markdown (blockquote markers and all) that is
      // supposed to be spliced verbatim into the text — checked separately, unnormalized, in
      // format-parity.test.mts. Normalizing the surrounding text (for every other leaf's
      // benefit) would make this one legitimately-verbatim field look like a mismatch.
      if (childPath === "escalate.humanMessage") continue;
      yield* walkLeaves(v, childPath, value);
    }
    return;
  }
  if (typeof value === "string" || typeof value === "number") {
    yield [path, String(value), container];
  }
}
