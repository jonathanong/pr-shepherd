# Development

## Principles

### Surface data, don't classify it

The CLI's job is to fetch and present raw-enough data; the agent's job is to interpret it. Whenever the CLI is tempted to derive a categorical enum from raw GitHub fields (e.g. "this CI failure is transient", "this comment is noise", "this review is a nit"), prefer instead to ship the raw fields and any context the agent would otherwise have to fetch separately — log tails, step names, summaries, author logins.

**Rule of thumb**: if removing a classification would force the agent to make another tool call to recover the same information, surface that information in the CLI output instead. If the agent already has the data and the classification is just a one-liner over it, delete the classification.

State-machine actions (`fix_code`, `cancel`, `mark_ready`, `wait`, `escalate`) and convenience rollups required by skill instructions (`ShepherdStatus`, `ShepherdMergeStatus`) are not classifications — they're either state transitions or summaries of raw state and stay in the CLI.

## Setup

**Before any `npx pr-shepherd` or `/pr-shepherd:*` invocation in this worktree**, verify `bin/` and `node_modules/` exist. If either is missing, run:

```bash
npm install
```

`npm install` triggers the `prepare` script, which builds `bin/` automatically. Do not skip this step — without it, `npx pr-shepherd` falls through to any globally installed binary, which may lack recent subcommands. Run `npm run build` directly only when you need to rebuild after editing TypeScript without reinstalling dependencies.

`npm install` runs husky, which sets `core.hooksPath` to `.husky/_` and wires up `.husky/pre-push` (lint + typecheck + format:check). Husky overrides any existing local `core.hooksPath`. Bypass with `git push --no-verify`.

Running `npm install` also updates the `~/.claude/plugins/marketplaces/local/plugins/pr-shepherd/skills` symlink to point at this worktree's `plugin/skills/`. After installing in a new worktree, run `/reload-plugins` (or restart Claude Code) so the plugin picks up the updated path.

## Output format invariant

`--format=json` and `--format=text` (default) must surface equivalent information. Every field exposed in JSON output should have a corresponding representation in text output, and vice versa. Do not add data to one format without updating the other.

## GitHub API

All GitHub I/O uses GraphQL by default. The only permitted REST call sites are:

- **Actions jobs/logs** (`src/checks/triage.mts`) — GitHub's GraphQL schema does not expose job-level data or log downloads.
- **Cancel workflow run** (`src/commands/iterate/helpers.mts`) — no `cancelWorkflowRun` GraphQL mutation exists.
- **`getMergeableState` fallback** (`src/github/client.mts`) — REST `GET /pulls/{n}` triggers GitHub's lazy mergeability computation when GraphQL returns `UNKNOWN`.

Any new `rest()` call outside these three cases must be justified against this list. GraphQL is preferred for all read paths; mutations that GitHub exposes via GraphQL must use GraphQL.

## Dogfooding

During development, run the CLI from this repository root with `npx pr-shepherd` (after `npm install && npm run build`).
This ensures you are using the built local CLI from this checkout rather than any globally installed version.
Use it from the same worktree/repository so it picks up the skills and configuration checked into this local checkout.

## Documentation

When making changes, review [`docs/`](docs/) and [`README.md`](README.md) for impact. Update them when the change affects user-facing behavior, commands, configuration, or workflows so the documentation stays in sync as part of the same change, not as a follow-up. If no documentation updates are needed, it is OK to leave them unchanged (optionally noting `docs: n/a`).

`docs/actions.md` is the canonical spec for `shepherd iterate` output — the monitor SKILL and agent consumers read the `## Instructions` sections and section structure directly. Any change to iterate action output (new triggers, new sections, new instruction variants, JSON field moves) must land together with the matching `docs/actions.md` edit in the same PR. If you change the CLI's output shape without updating the doc, the skill silently drifts.

## Lean output

CLI output should only include information that is relevant or actionable in the current state. Omit fields and lines that add noise without value:

- Do not emit a field, flag, or line when its value is the trivial default (false, null, 0, empty). For example: do not emit `copilotReviewInProgress` unless it is `true`.
- Do not emit time-bounded or state-specific fields outside the state where they are meaningful. For example: do not emit `remainingSeconds` unless the PR is in the final ready-delay countdown.
- Do not repeat information the reader already has from an earlier line in the same output block.
- Omit section headers and labels when the section would be empty.

The goal is to keep context usage low for agent consumers and to make human output scannable. When in doubt, ask: "would a reader act on this line right now?" If not, leave it out.

## Markdown output readability

CLI output that targets a human or an AI agent must be easy to read and act on:

- Every heading (`##`, `###`) is followed by a blank line before its body.
- Each independently actionable item goes on its own line — use a bullet list or a numbered list. Do not chain multiple action items together on one line with `·`, `,`, or `;`. Informational summaries, status rollups, and ID lists that are meant to be scanned rather than acted on item-by-item may stay inline if they remain easy to read. (The base/summary status lines in `formatIterateResult` are a dashboard meant to be scanned at a glance, not acted on individually — those are exempt.)
- Long output is acceptable. Prefer clarity over brevity for instructions and other content the reader is expected to act on.
- When the output tells the reader to do something, phrase it as explicit, numbered steps.

## Comment visibility invariant

Every review thread and PR comment must be surfaced to the agent **at least
once**, even if it is outdated, resolved, or minimized. Filtering those out
before the agent sees them silently discards reviewer intent.

Each first-look item carries its current status (`outdated`, `resolved`, or
`minimized`). Outdated threads also carry an `autoResolved` boolean that is
`true` when Shepherd closed the thread during this run (rendered as
`[status: outdated, auto-resolved]` in output).

To avoid re-surfacing items on every fetch, a per-item "seen" marker is
written after first display. Markers live at:

```
$PR_SHEPHERD_STATE_DIR/<owner>-<repo>/<pr>/seen/<id>.json
```

The per-worktree debug log lives as a peer at:

```
$PR_SHEPHERD_STATE_DIR/<owner>-<repo>/worktrees/<basename>-<sha8>.md
```

Print the path with `npx pr-shepherd log-file`. Disable with `PR_SHEPHERD_LOG_DISABLED=1`.

One file per id — file existence is the marker. The JSON payload is
`{ "seenAt": <unix>, "bodyHash": "<16-hex-chars>" }` (SHA-256 of the item's
body, truncated); the schema is intentionally open so future fields
(classification, agent-reply, etc.) can be added without breaking readers.
Do not adopt formats that lock the schema (empty touch files, a single
shared list).

The `bodyHash` enables **in-place edit detection**: on each fetch, if a
candidate item is in the seen set but its current body hashes differently
from the stored hash, Shepherd re-surfaces it as an "edited" item. The item
is tagged `[status: …, edited]` or rendered under a new
`## … (edited since first look)` section. The marker hash is updated after
display; the original `seenAt` is preserved. Legacy markers without
`bodyHash` are treated conservatively as unchanged and are not re-surfaced.

Writes are no longer O_EXCL: `markSeen` reads any existing marker to
preserve `seenAt`, then writes with `flag: "w"`. Under concurrent runs the
last writer's hash wins — acceptable because both writes carry valid current
state.

Any new code path that filters threads or comments by `isResolved`,
`isOutdated`, or `isMinimized` must route them through the seen-marker gate
before suppression — never drop them outright.

**Non-minimized `COMMENTED` review summaries** are now gated: `check.mts`
splits `batchData.reviewSummaries` into three buckets:
- `firstLookSummaries` — never seen before; body rendered, ID in `--minimize-comment-ids`.
- `editedSummaries` — seen before but body changed; body re-rendered, ID **NOT** in `--minimize-comment-ids` (already minimized server-side).
- `reviewSummaries` — seen before, body unchanged; bare IDs only, in minimize queue.

`firstLookSummaries` and `reviewSummaries` IDs are merged into
`--minimize-comment-ids` in the same resolve command invocation. The body is
surfaced on first encounter and again whenever the author edits it.

**Scope note:** Already-minimized `COMMENTED` reviews are not covered —
`batch-parsers.mts` filters them out before any gate runs (`!r.isMinimized`),
so their bodies are never fetched. This remains future work.

Implementation lives in `src/state/seen-comments.mts`. The call sites are
`src/commands/resolve.mts` (surfaced in `resolve --fetch` output under
`## First-look items`) and `src/commands/check.mts` (surfaced in iterate's
`fix_code` output under `## Review summaries (first look — to be minimized)`
and in `pr-shepherd check` text output under `## First-look items`).

## Keep skills and loop prompts minimal

Skills (`plugin/skills/*/SKILL.md`) and `/loop` prompts should be thin dispatchers with this shape:

1. Parse arguments.
2. Short-circuit trivial cases (e.g. merged PR).
3. Invoke the CLI.
4. Print the full output.
5. Follow the output's own `## Instructions` section exactly.

The canonical example is `plugin/skills/resolve/SKILL.md` — 37 lines, pure dispatcher, no policy.

Everything else belongs in the CLI's Markdown `## Instructions` output, not in the skill:

- Per-action dispatch (which command to extract, which tool to call, what variant to run).
- **Interpretation and policy tables keyed on CLI output shape** — enum meanings (e.g. what `CONFLICTS` means for rebase), CI budget rules (`failureKind` handling, rerun commands), ready-to-merge predicates, field-by-field reporting templates.
- Any instruction the reader is expected to act on.

Rule of thumb: if a skill contains a table, policy, or interpretation block whose inputs come from CLI output fields, that content belongs in the CLI's `## Instructions` section instead.

Skills must not link to files outside the `plugin/` directory (such as `docs/**` or `README.md`). Those files are not included in the published plugin and will be dead links for consumers. All information a skill consumer needs must come from the CLI output itself or be written inline in the skill.
