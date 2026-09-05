# Development

## Principles

### Surface data, don't classify it

The CLI's job is to fetch and present raw-enough data; the agent's job is to interpret it. Whenever the CLI is tempted to derive a categorical enum from raw GitHub fields (e.g. "this CI failure is transient", "this comment is noise", "this review is a nit"), prefer instead to ship the raw fields and any context the agent would otherwise have to fetch separately — log tails, step names, summaries, author logins.

**Rule of thumb**: if removing a classification would force the agent to make another tool call to recover the same information, surface that information in the CLI output instead. If the agent already has the data and the classification is just a one-liner over it, delete the classification.

State-machine actions (`fix_code`, `cancel`, `mark_ready`, `wait`, `escalate`) and convenience rollups required by skill instructions (`ShepherdStatus`, `ShepherdMergeStatus`) are not classifications — they're either state transitions or summaries of raw state and stay in the CLI.

## Setup

**Before any `npx pr-shepherd` or `/pr-shepherd:*` invocation in this worktree**, verify `bin/` and `node_modules/` exist. If either is missing, run this source checkout's package-manager install command. This checkout uses npm (`package-lock.json`), so run:

```bash
npm install
```

`npm install` triggers the `prepare` script, which builds `bin/` automatically. Do not skip this step — without it, `npx pr-shepherd` falls through to any globally installed binary, which may lack recent subcommands. Run `npm run build` directly only when you need to rebuild after editing TypeScript without reinstalling dependencies.

`npm install` runs husky, which sets `core.hooksPath` to `.husky/_` and wires up `.husky/pre-push` (lint + typecheck + format:check). Husky overrides any existing local `core.hooksPath`. Bypass with `git push --no-verify`.

## Output format invariant

`--format=json` and `--format=text` (default) must surface equivalent information. Every field exposed in JSON output should have a corresponding representation in text output, and vice versa. Do not add data to one format without updating the other.

The invariant extends to MCP: a tool's `structuredContent` and its Markdown `content` must be produced from the same projection options, so the two channels surface equivalent information. Tools whose CLI counterpart prints the raw result as JSON (`apply`, `build_suggestion_patches`) return that raw result unprojected in `structuredContent`.

## GitHub API

All GitHub I/O uses GraphQL by default. The only permitted REST call sites are:

- **Actions jobs/logs** (`src/checks/triage.mts`) — GitHub's GraphQL schema does not expose job-level data or log downloads.
- **Cancel workflow run** (`src/commands/iterate/helpers.mts`) — no `cancelWorkflowRun` GraphQL mutation exists.
- **`getMergeableState` fallback** (`src/github/client.mts`) — REST `GET /pulls/{n}` triggers GitHub's lazy mergeability computation when GraphQL returns `UNKNOWN`.

Any new `rest()` call outside these three cases must be justified against this list. GraphQL is preferred for all read paths; mutations that GitHub exposes via GraphQL must use GraphQL.

## Git operations

All git invocations from the CLI must be read-only (`status`, `rev-parse`, `log`, `diff`, `remote get-url`, `for-each-ref`, etc.). The CLI must never invoke git mutations (`add`, `commit`, `apply`, `checkout --`, `reset`, `rebase`, `merge`, `push`, `fetch`, `pull`, `stash`, `restore`, `switch`, `cherry-pick`, `revert`, `am`, `config --set`, `branch -d/-D`, `tag -d`, etc.).

**Why:** mutating `git` subprocesses can leave `.git/index.lock` behind on hook failure, breaking every subsequent operation in the worktree until cleaned up by hand. The calling agent already owns the git lifecycle and has the retry / cleanup / sandbox-bypass machinery to handle this correctly.

Instead, emit a suggestion: build the patch / commit message / file list and return it in the result, with a `## Instructions` block telling the caller what to run. The canonical example is `commit-suggestion` — it produces the patch and suggested git commands; the agent executes them.

### Push access is a usage precondition

`pr-shepherd` assumes the calling agent can push to the pull request's head branch. Do not use it to iterate a PR whose head branch the caller cannot update. GitHub viewer fields such as `viewerCanEditFiles` and `headRepositoryPermission` remain raw context; they must not gate normal `FIX_CODE` push instructions or create a separate push-authorization handoff.

A user request to make, create, or open a PR tells the caller to proceed with the ordinary non-force push of the reviewed, in-scope commits to this repository's configured push remote and creation of that PR. Do not ask for a separate conversational confirmation solely because the push publishes those changes; request runtime escalation directly when the host requires it. Skills and repository instructions cannot grant or bypass host permissions, so unattended approval belongs in a trusted command rule or equivalent host policy. Force-pushes, remote or credential changes, unrelated changes, and ambiguous targets remain outside this workflow.

`FIX_CODE` is always non-terminal: the caller completes the work, commits and pushes when needed, runs authorized review mutations, and invokes Shepherd again. Only `ESCALATE` hands work to a human; `CANCEL` ends polling without a handoff.

Denied or unverifiable review replies, thread resolutions, and bot-review dismissals are one-look skips, not handoffs: Shepherd surfaces/logs the item once, omits the mutation, excludes it from fix-attempt accounting, and suppresses it until edited. Active threads without a path or line follow the same rule. An unresolved outdated detected/configured-bot thread with `viewerCanResolve: true` is the narrow exception: it remains resolution-only work and is resolved by thread ID even after GitHub clears its source location. `authorization-required` is reserved for attempted mark-ready and merge/enqueue state changes; the finite trigger list is documented in [`docs/escalations.md`](docs/escalations.md).

## Dogfooding

During development, run the CLI from this repository root with `npx pr-shepherd` (after the source checkout's package-manager install command and build; currently `npm install && npm run build`).
This ensures you are using the built local CLI from this checkout rather than any globally installed version.
Use it from the same worktree/repository so it picks up the skills and configuration checked into this local checkout.

## Documentation

When making changes, review [`docs/`](docs/) and [`README.md`](README.md) for impact. Update them when the change affects user-facing behavior, commands, configuration, or workflows so the documentation stays in sync as part of the same change, not as a follow-up. If no documentation updates are needed, it is OK to leave them unchanged (optionally noting `docs: n/a`).

`docs/actions.md` is the canonical spec for `shepherd iterate` output — the monitor SKILL and agent consumers read the `## Instructions` sections and section structure directly. Any change to iterate action output (new triggers, new sections, new instruction variants, JSON field moves) must land together with the matching `docs/actions.md` edit in the same PR. If you change the CLI's output shape without updating the doc, the skill silently drifts.

## Lean output

CLI output should only include information that is relevant or actionable in the current state. Omit fields and lines that add noise without value:

- Do not emit a field, flag, or line when its value is the trivial default (false, null, 0, empty). For example: do not emit `blockingBotReviewInProgress` unless it is `true`.
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
`fix_code` output under `## Review summaries (first look — to be minimized)`).

## Keep skills and loop prompts minimal

Skills (`plugins/pr-shepherd/skills/*/SKILL.md`) and `/loop` prompts should be thin dispatchers with this shape:

1. Parse arguments.
2. Short-circuit trivial cases (e.g. merged PR).
3. Invoke the CLI.
4. Print the full output.
5. Follow the output's own `## Instructions` section exactly.

The canonical example is `plugins/pr-shepherd/skills/pr-shepherd/SKILL.md` — pure dispatcher for its numbered steps, plus an appended `## Playbooks` section (see the invariant-procedure exception below). The dispatch logic itself carries no policy.

Everything else belongs in the CLI's Markdown `## Instructions` output, not in the skill:

- Per-action dispatch (which command to extract, which tool to call, what variant to run).
- **Interpretation and policy tables keyed on CLI output shape** — enum meanings (e.g. what `CONFLICTS` means for rebase), ready-to-merge predicates, field-by-field reporting templates. (CI rerun policy — `failureKind` handling, `gh run view`/`gh run rerun` rules — is the one exception: see the invariant-procedure rule below. It moved to the skill's "CI failure triage" playbook because its trigger data, the `[conclusion: …]` tags, stays in the CLI's `## Failing checks` section, so applying it costs the agent no extra tool call.)
- Any instruction the reader is expected to act on, **unless** it is an invariant procedure per the rule below.

Rule of thumb: if a skill contains a table, policy, or interpretation block whose inputs come from CLI output fields, that content belongs in the CLI's `## Instructions` section instead — unless the block's *text* is invariant (see below), in which case the CLI keeps only the trigger and the concrete command, and the skill holds the fixed procedure.

**Invariant-procedure exception:** a step whose *text* is byte-identical on every invocation — exception handling or ID-routing policy — belongs inline in the skill under `## Playbooks`, which loads it once per session, rather than in `## Instructions`, which would repeat it every tick. The test is whether the printed command/instruction stays safe and complete if the caller acts on it **exactly as printed, without the skill's guidance**: dismiss-ID retention and the first-look/annotation ID-exclusion rules pass this test (the printed command run unmodified is already correct; only *editing* it incorrectly causes harm), so they moved to the skill. Placeholder substitution (`$HEAD_SHA`, `$DISMISS_MESSAGE`) fails it — the printed command is invalid without substitution — so those steps stay in `## Instructions` even though their text never varies. Marker-based self-reply prevention is reflected directly in the CLI-generated IDs, with `buildResolveCommandInstruction` explaining why callers must keep those IDs unchanged. The CLI still owns the *trigger* (deciding from output fields which playbook applies) and the *concrete command* (built from output fields, e.g. thread IDs, PR number), so a consumer without the skill still acts correctly on the happy path — only the exception branches move. Skills must not link to files outside `plugins/pr-shepherd/`, so moved content is written inline in `SKILL.md`, never linked to `docs/`.

However, the CLI's `## Instructions` output must not duplicate guidance the caller's runtime already provides deterministically. Specifically:

- Do not prescribe `git` mechanics the caller's pre-push hooks / `CLAUDE.md` already enforce (lint, typecheck, format) or that the caller's conventions specify (rebase style, push flags). Surface raw state (branch behind base, conflicts) and emit a one-liner pointer instead.
- The CLI does not classify what will require code edits — only the agent can decide. Do not gate instruction steps on heuristics like "threads are present, therefore a push is needed." Emit all relevant data sections and use inline `if`/`else` phrasing.
- Phrase multi-branch logic as inline `if` conditions in the same instruction step, not as separate CLI-predicated sections.

Skills must not link to files outside the `plugins/pr-shepherd/` directory (such as `docs/**` or `README.md`). Those files are not included in the published plugin and will be dead links for consumers. All information a skill consumer needs must come from the CLI output itself or be written inline in the skill.

## Help flags

Every subcommand (and the top-level CLI) must honor `--help` and `-h`:

- The flag short-circuits before any I/O, work, or validation.
- It prints the command's usage string to stdout and exits 0.
- Usage strings live in `src/cli/help-top-page.mts` (the top-level page), `src/cli/help-command-pages.mts` (the `COMMAND_USAGE` map), `src/cli/help-iterate-poll-pages.mts` (`iterate`, `poll`, and the derived default `pr-shepherd [PR]` page), and `src/cli/help-log-file-page.mts`. `src/cli/help.mts` merges them into `USAGE` and exposes `helpKeyForArgs` / `maybePrintHelp`. Adding a new subcommand requires adding its `COMMAND_USAGE` entry and an early `if (maybePrintHelp(args, "<key>")) return;` line in its handler.
- Top-level `pr-shepherd --help` / `-h` is intercepted in `main()` in `src/cli-parser.mts` before `setupLog`, matching the `--version` precedent.
- The default poll path (`pr-shepherd [PR] [flags]`) also honors `--help`/`-h` anywhere in the arg list: `main()` in `src/cli-parser.mts` intercepts the flag before `setupLog` and prints `USAGE.default` when `isDefaultPollInvocation` (from `src/cli/default-poll.mts`) matches. `validateDefaultPollArgs`, in the same file, runs only after that short-circuit and rejects unknown flags and subcommands.
