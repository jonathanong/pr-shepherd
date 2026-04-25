# shepherd actions

[← README](../README.md)

Each iteration of `shepherd iterate` returns exactly one action. See [docs/iterate-flow.md](iterate-flow.md) for the decision order.

The default output format is Markdown — what you see when running `npx pr-shepherd iterate <PR>`, and what the monitor SKILL reads each cron tick. `--format=json` emits the same information as a single JSON object for scripting. Every example below shows what the agent actually sees in the default (lean) format.

Pass `--verbose` to get more debug state. In JSON mode, the full `IterateResult` is returned (all fields, including `baseBranch`, `checks`, `shouldCancel`). In Markdown mode, `--verbose` restores the full header summary line (all four counts, `remainingSeconds`, `copilotReviewInProgress`, `isDraft`, `shouldCancel` always shown, and `[COOLDOWN]` no longer suppresses the base/summary block) — but Markdown is structurally different from JSON and does not guarantee field-for-field parity (array fields like `baseBranch` or `checks` are not added to Markdown for actions that do not normally render them). Lean mode is the default because most fields are `false`/`0`/`[]` on a typical healthy tick and add context noise without value.

**Output shape (every action, default lean format):**

```
# PR #<N> [ACTION]

**status** `<…>` · **merge** `<…>` · **state** `<…>` · **repo** `<…>`
**summary** <N> passing[, <N> skipped][, <N> filtered][, <N> inProgress][· **remainingSeconds** <N>][· **copilotReviewInProgress**][· **isDraft**]

<action-specific body>

## Instructions

1. <numbered steps telling the monitor exactly what to do>
```

Lean-mode rules for the summary line:

- Zero counts (`skipped`, `filtered`, `inProgress`) are omitted.
- `remainingSeconds` is shown only when the ready-delay timer is actively counting down (`status === "READY"` and `remainingSeconds > 0`).
- `copilotReviewInProgress` and `isDraft` are shown only when `true`.
- `shouldCancel` is never shown (it is fully implied by `action === "cancel"`).
- `[COOLDOWN]` suppresses the base/summary lines entirely — the action carries only UNKNOWN/empty placeholders.

`--verbose` restores the full summary line: all four counts, `remainingSeconds`, `copilotReviewInProgress`, `isDraft`, and `shouldCancel` always present.

Load-bearing conventions (the monitor SKILL depends on these):

1. Line 1 is always an H1 heading of the form `# PR #<N> [<ACTION>]`. The action tag identifies the output for logging and validation — behavior is driven by the `## Instructions` section, not by dispatching on the tag.
2. Lines 3–4 carry the base fields (status, merge, state, repo, summary). In lean mode, fields at their trivial default are omitted; `--verbose` restores the full scalar header/summary line in Markdown. JSON verbose mode returns the complete `IterateResult` including fields not present in Markdown (e.g. `baseBranch`, `checks` on all actions); Markdown is structurally lossy relative to JSON and `--verbose` does not close that gap.
3. Every action ends with a `## Instructions` section — numbered `1.`, `2.`, … — that tells the monitor exactly what to do. The monitor follows those steps; it does not need its own dispatch table.
4. Under `[REBASE]`, the shell script is inside a ```bash fenced block — instruction 1 tells the monitor to extract and run it.
5. Under `[FIX_CODE]`, the `## Post-fix push` section has a `` resolve: `<command>` `` bullet — the instructions reference this bullet so the monitor strips backticks and runs the command.
6. Passing check counts are surfaced only via the `**summary**` line — no per-check detail is emitted for passing checks. Failing check detail appears in `## Failing checks` (within `[FIX_CODE]` output). JSON surfaces check data as `checks: RelevantCheck[]` only on `fix_code` actions in lean mode; `--format=json --verbose` includes `checks` on all actions (full IterateResult).

---

## `cooldown`

Skips all work because the last commit is too fresh for CI checks to have started.

**Trigger:** `nowSeconds − lastCommitTime < cooldownSeconds` (default 30s). No sweep is run.

**CLI side-effects:** None.

**Exit code:** 0

**Markdown output:**

```markdown
# PR #42 [COOLDOWN]

SKIP: CI still starting — waiting for first check to appear

## Instructions

1. End this iteration — the next cron fire will recheck once CI starts reporting.
```

`status`, `merge`, `state`, and `repo` are not emitted in default mode — they carry UNKNOWN/empty placeholders because the early return happens before any GitHub sweep. Pass `--verbose` to see all fields.

**What the monitor does:** Follow `## Instructions` — end the iteration and wait for the next cron fire.

---

## `wait`

Nothing actionable to do; all CI is passing or in-progress.

**Trigger:** Fallthrough — no actionable work, no terminal state, not ready to mark, no ready-delay elapsed.

**CLI side-effects:** None.

**Exit code:** 0

**Markdown output:**

```markdown
# PR #42 [WAIT]

**status** `IN_PROGRESS` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 3 passing, 2 inProgress

WAIT: 3 passing, 2 in-progress — 120s until auto-cancel

## Instructions

1. End this iteration — the next cron fire will recheck.
```

The body line (`WAIT: …`) varies with the merge state — `branch is behind base`, `blocked by pending reviews or required status checks`, `PR is a draft`, or `some checks are unstable`.

**What the monitor does:** Follow `## Instructions` — end the iteration and wait for the next cron fire.

---

## `mark_ready`

Converts a draft PR to ready for review.

**Trigger:** All of: `status === "READY"`, `mergeStateStatus === "CLEAN"` (or `"DRAFT"` when `isDraft`), Copilot review not in progress, `isDraft === true`, `config.actions.autoMarkReady` is enabled (disable with `--no-auto-mark-ready`), and ready-delay not elapsed (`readyState.shouldCancel === false`). Once the delay elapses, the action flips to `cancel`.

**CLI side-effects:** Calls the `markPullRequestReadyForReview` GraphQL mutation before returning.

**Exit code:** 0

**Markdown output:**

```markdown
# PR #42 [MARK_READY]

**status** `READY` · **merge** `DRAFT` · **state** `OPEN` · **repo** `owner/repo`
**summary** 5 passing · **remainingSeconds** 600 · **isDraft**

MARKED READY: PR #42 converted from draft to ready for review

## Instructions

1. The CLI already marked the PR ready for review — end this iteration.
```

**What the monitor does:** Follow `## Instructions` — end the iteration and continue monitoring on the next cron fire.

---

## `cancel`

Stops the monitor loop — no further iterations needed.

**Trigger:** Either the PR is merged or closed (`state !== "OPEN"`), or the ready-delay timer elapsed (`readyState.shouldCancel`).

**CLI side-effects:** None. The `ready-since.txt` file is left in place.

**Exit code:** 2

**`reason` field:** The result carries a structured `reason` discriminator — `"merged"`, `"closed"`, or `"ready-delay-elapsed"` — as a first-class field in both JSON and Markdown output. JSON consumers should branch on `reason` rather than parsing `log`.

**Markdown output:**

```markdown
# PR #42 [CANCEL] — merged

**status** `READY` · **merge** `CLEAN` · **state** `MERGED` · **repo** `owner/repo`
**summary** 5 passing

CANCEL: PR #42 is merged — stopping monitor

## Instructions

1. Invoke `/loop cancel` via the Skill tool.
2. Stop.
```

Other heading variants: `# PR #42 [CANCEL] — closed`, `# PR #42 [CANCEL] — ready-delay-elapsed`.

Other body-line variants: `CANCEL: PR #42 is closed — stopping monitor`, `CANCEL: PR #42 has been ready for review — ready-delay elapsed, stopping monitor`.

**What the monitor does:** Follow `## Instructions` — invoke `/loop cancel` via Skill tool to stop the cron job.

---

## `fix_code`

Actionable work needs a code fix, commit, and push.

**Trigger:** Any of: unresolved inline review threads, actionable PR-level comments, `CHANGES_REQUESTED` reviews, any failing CI check, merge conflicts (`mergeStatus.status === "CONFLICTS"`), pending review summary IDs to minimize, or review summaries to surface. Failing checks of all types (timeout, cancelled, actionable) route here — the agent reads the `logTail` in the output and decides whether to rerun or fix.

**CLI side-effects:** Issues a `POST /repos/{owner}/{repo}/actions/runs/{runId}/cancel` REST call for each unique run ID of failing CI checks (best-effort; already-completed runs return 409 and are silently ignored). **Important:** this cancellation runs on the pre-push run IDs recorded in the sweep — do not re-cancel these IDs after you push, because the push replaces them with fresh runs whose IDs differ.

**Exit code:** 1

**Markdown output:**

````markdown
# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 3 passing

## Review threads

### `PRRT_kwDOSGizTs58XB1L` — `src/commands/iterate.mts:42` (@alice)

> The variable name is misleading.
>
> Consider renaming `x` to `remainingSeconds` so readers don't have to
> trace back to the declaration to understand its meaning.

## Actionable comments

### `IC_kwDOSGizTs7_ajT8` (@bob)

> Consider using a more descriptive name here.

## Failing checks

- `24697658766` — `CI › lint / typecheck / test (22.x)`
  > Run tests

```

Error: 2 tests failed
AssertionError: expected true to be false

```

## Changes-requested reviews

- `PRR_kwDOSGizTs58XB1R` (@alice)

## Noise (minimize only)

`IC_kwDOSGizTs7_ajT9`

## Cancelled runs

`24697658765`

## Post-fix push

- base: `main`
- resolve: `npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_kwDOSGizTs58XB1L --minimize-comment-ids IC_kwDOSGizTs7_ajT8,IC_kwDOSGizTs7_ajT9 --dismiss-review-ids PRR_kwDOSGizTs58XB1R --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Apply code fixes: read and edit each file referenced under `## Review threads` and `## Actionable comments` above.
2. For each failing check under `## Failing checks` with a run ID: examine the log tail shown in the fenced block. If the log shows a transient runner or infrastructure failure (e.g. network timeout, runner setup crash, OOM kill), run `gh run rerun <runId> --failed` and stop this iteration — CI will re-run automatically. If the log shows a real test or build failure, apply a code fix.
3. For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes.
4. Commit changed files: `git add <files> && git commit -m "<descriptive message>"`
5. Keep the PR title and description current: if the changes alter the PR's scope or intent, run `gh pr edit 42 --title "<new title>" --body "<new body>"` to reflect them. Skip if the existing title/body still accurately describe the PR.
6. Rebase and push: `git fetch origin && git rebase origin/main && git push --force-with-lease` — capture `HEAD_SHA=$(git rev-parse HEAD)`
7. Run the `resolve:` command shown above, substituting "$HEAD_SHA" with the pushed commit SHA and $DISMISS_MESSAGE with a one-sentence description of what you changed.
8. Do not re-run `gh run cancel` on the IDs listed under `## Cancelled runs` — the CLI cancelled those runs before your push, and your push has already triggered new runs with different IDs.
9. For any large decisions or rejections you made this iteration, add or update a `## Shepherd Journal` section in the PR description (`gh pr edit 42 --body …`) summarizing each decision and linking back to the originating comment, thread, or review.
10. Stop this iteration — CI needs time to run on the new push before the next tick.
````

**Section order:**

1. Heading + base fields (always present).
2. `## Review threads` — each thread under `### <id> — <loc> (@author)` with the full body as a `>` blockquote. Multi-paragraph bodies preserve empty lines as `>` lines, so code blocks and ` ```suggestion ` blocks survive intact.
3. `## Actionable comments` — same shape as threads minus the `<loc>`.
4. `## Failing checks` — one bullet per failing check. Shape varies by locator:
   - ``- `<runId>` — `<workflowName> › <jobName>` `` for GitHub Actions checks (`workflowName ›` prefix omitted when unavailable; `jobName` falls back to the check name when absent).
   - ``- external `<detailsUrl>` — `<name>` `` for external status checks (codecov, vercel, etc.) with null `runId` but a URL.
   - ``- (no runId) — `<name>` `` when both are null.

   Each bullet may be followed by: a `> <failedStep>` blockquote line (the first step that failed, GitHub Actions only), a `> <summary>` blockquote line (one-line status text from the GitHub UI), and a fenced code block containing the last `checks.logTailLines` lines of the job log. All three are omitted when not available.

   The numbered instructions split accordingly: for GitHub Actions checks (with runId), the agent examines the `logTail` fenced block and decides whether to run `gh run rerun <runId> --failed` (transient failure) or apply a code fix (real failure). For external status checks (detailsUrl only), the step says to open the URL in a browser. When both are absent, the step says to escalate to a human.

5. `## Changes-requested reviews` — one bullet per `CHANGES_REQUESTED` review: ``- `<reviewId>` (@<author>)``.
6. `## Noise (minimize only)` — backticked IDs of bot-noise comments (quota warnings, rate-limit acks). Minimize on GitHub but do not act on them.
7. `## Review summaries (minimize only)` — backticked review IDs (`PRR_…`) of `COMMENTED` review summaries (and, if `iterate.minimizeApprovals` is `true`, `APPROVED` reviews) that will be minimized by the resolve command. Not emitted if the list is empty.
8. `## Approvals (surfaced — not minimized)` — emitted when `iterate.minimizeApprovals` is `false` (default) and there are `APPROVED`-state reviews. Same H3-plus-blockquote shape as `## Review threads`; surfaced for visibility, but NOT included in `--minimize-comment-ids`.
9. `## First-look items (N) — already closed on GitHub; acknowledge only` — threads and PR comments that are outdated, resolved, or minimized and have not yet been acknowledged by the agent. Emitted on first encounter only; a per-item seen-marker file (`src/state/seen-comments.mts`) suppresses them on subsequent runs. Each bullet carries a `[status: …]` tag: `outdated`, `outdated, auto-resolved`, `resolved`, or `minimized`. These IDs must **not** appear in `--resolve-thread-ids`, `--minimize-comment-ids`, or `--dismiss-review-ids` — they are already closed on GitHub. The agent's only task is to acknowledge each with a one-line classification. Not emitted when empty.
10. `## Cancelled runs` — backticked IDs, emitted only when at least one pre-push REST cancellation succeeded.
11. `## Post-fix push`:
    - ``- base: `<branch>` `` — rebase target for the push step.
    - ``- resolve: `<argv>` `` — fully-quoted resolve command. `$DISMISS_MESSAGE` and `$HEAD_SHA` are always quoted so substituting a multi-word sentence keeps it as one argument. `--require-sha "$HEAD_SHA"` is appended only when a push is expected (threads/actionableComments/checks/reviews present); noise/summary-only dispatches omit it.
12. `## Instructions` — numbered list to execute in order. The final instruction always refers back to the `resolve:` bullet rather than duplicating the command — that single source of truth is what the monitor executes.

**Instruction variants:**

- `Commit changed files:` is only emitted when there are actual code changes to commit (threads/comments/checks/reviews present). A `CONFLICTS`-only state skips this step.
- `Keep the PR title and description current:` is emitted immediately after the commit step and uses the same gate (`hasCodeChanges`). A `CONFLICTS`-only dispatch (no code to commit) omits it.
- The rebase step switches wording based on `mergeStatus.status`. When conflicts are present it emits "Rebase with conflict resolution" and walks through `git rebase --continue` loops; otherwise it emits the clean one-liner `git fetch origin && git rebase origin/<base> && git push --force-with-lease`.
- `## Failing checks` generates one instruction step per locator type present. When a check has a numeric `runId`, the step says to examine the log tail in the fenced block and decide: run `gh run rerun <runId> --failed` if the log shows a transient infrastructure failure, or apply a code fix if it shows a real test/build failure. When a check has only a `detailsUrl` (external status check — no `runId`), the step says to open the URL in a browser. When both are absent, the step says to escalate to a human.
- The `resolve:` instruction is emitted when `resolveCommand.hasMutations` is true — i.e. when at least one of `threads`, `actionableComments`, `noiseCommentIds`, or `reviewSummaryIds` is non-empty. Noise-only and summary-only dispatches also emit the instruction. A `CONFLICTS`-only dispatch (none of those non-empty) omits it.
- A `Do not re-run \`gh run cancel\``instruction is appended when`cancelled` is non-empty and a push is required — it reminds the monitor that those IDs were cancelled pre-push and new runs have since been triggered.
- A `For any large decisions or rejections …` (Shepherd Journal) instruction is appended when `resolveCommand.hasMutations` is true — i.e. when at least one of threads, actionable comments, noise IDs, or review summary IDs is non-empty. It asks the agent to add or update a `## Shepherd Journal` section in the PR description (`gh pr edit <N> --body …`) summarizing each decision and linking back to the originating comment, thread, or review. Conflicts-only dispatches (none of those non-empty) omit it.
- An `Items in \`## First-look items\``step is appended when`firstLookThreads`or`firstLookComments` are non-empty — it tells the agent these items are already closed and must not be passed to the resolve command.
- The final "iteration" step has three variants: `Stop this iteration — CI needs time to run on the new push before the next tick.` when a push occurred; `Stop this iteration before the next tick.` when only GitHub mutations were made (no push); `End this iteration.` when no push or mutations occurred.

The JSON payload exposes the same data under `fix.{threads, actionableComments, noiseCommentIds, reviewSummaryIds, surfacedApprovals, checks, changesRequestedReviews, resolveCommand, instructions, mode, firstLookThreads, firstLookComments}` — where `fix.mode === "rebase-and-push"` is the type discriminator — plus top-level `baseBranch` (on `IterateResultBase`, not under `fix`) and `cancelled`. `reviewSummaryIds` are merged into `--minimize-comment-ids` inside `resolveCommand.argv`; `surfacedApprovals` are informational only. In lean JSON mode, `fix.*` arrays that are empty are omitted; `cancelled` is omitted when empty. Pass `--verbose` to include all fields. `firstLookThreads` and `firstLookComments` are informational — they carry `firstLookStatus` and (for outdated threads) `autoResolved` fields but must not be routed to resolve mutations.

**Resolve command rules (same in Markdown and JSON):**

- `--require-sha "$HEAD_SHA"` is appended only when a push occurred. Noise-only minimizations omit it.
- `$DISMISS_MESSAGE` must be one specific sentence describing what changed — never generic text like "address review comments".

### Applying ` ```suggestion ` blocks

GitHub reviewers can leave ` ```suggestion ` fenced blocks in review thread bodies. In `iterate`'s `fix_code` output these ride verbatim inside the blockquoted thread body — there is no separate structured field. The numbered `## Instructions` say "read and edit each file," which applies equally to suggestion blocks.

**Single-line suggestion.** Thread locators in `[FIX_CODE]` use the end line only (e.g. `src/foo.ts:42`). When the body contains a suggestion block, replace exactly that line with the suggestion's content:

````markdown
### `PRRT_kwDOSGizTs58XB1L` — `src/foo.ts:42` (@alice)

> Rename `x` to `remainingSeconds` so readers don't have to trace back to the declaration.
>
> ```suggestion
> const remainingSeconds = computeRemaining();
> ```
````

Steps: open `src/foo.ts`, replace line 42 with `const remainingSeconds = computeRemaining();`, then proceed to the commit step in `## Instructions`.

**Multi-line suggestion.** When the thread spans a range the locator shows only the end line (e.g. `src/foo.ts:42`), but the suggestion body replaces all lines from `startLine` to `line` inclusive. An empty suggestion body deletes those lines; a body of one blank line replaces the range with a single blank line.

````markdown
### `PRRT_kwDOSGizTs58XB2M` — `src/foo.ts:42` (@alice)

> Collapse these three assignments into one.
>
> ```suggestion
> const result = computeAll();
> ```
````

If the reviewer's thread was originally anchored to lines 40–42, you replace lines 40–42 with the single suggestion line. When the range isn't obvious from context, read the surrounding file to find which lines the comment is attached to.

**Multiple suggestions (two or more threads).** Apply each suggestion to its target file. The edits are independent — apply them in any order that avoids line-number drift (apply suggestions on later lines first when both touch the same file). Then make a single `git add && git commit` covering all the changed files before the rebase/push step in `## Instructions`. Both thread IDs go into the `resolve:` command's `--resolve-thread-ids` argument as a comma-separated list.

Example with two threads:

````markdown
## Review threads

### `PRRT_kwDOSGizTs58XB1L` — `src/foo.ts:42` (@alice)

> ```suggestion
> const remainingSeconds = computeRemaining();
> ```

### `PRRT_kwDOSGizTs58XC2M` — `src/bar.ts:17` (@alice)

> ```suggestion
> return value ?? defaultValue;
> ```
````

Apply both edits, then commit and push together. The `resolve:` command at the bottom of `## Post-fix push` already includes both IDs:

```
- resolve: `npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_kwDOSGizTs58XB1L,PRRT_kwDOSGizTs58XC2M --require-sha "$HEAD_SHA" --message "$DISMISS_MESSAGE"`
```

**Alternative: structured path via `commit-suggestion`.** Instead of editing files manually, you can shell out to `npx pr-shepherd commit-suggestion <PR> --thread-id <id> --message "…"`. This builds a unified diff from the suggestion block, validates it with `git apply --check`, writes the file, commits with a `Co-authored-by: <reviewer>` trailer, and resolves the thread on GitHub — all in one command. Pass `--dry-run` (omitting `--message`) to preview the unified diff without mutating the working tree, index, or GitHub state — the CLI exits `0` when the patch would apply cleanly, `1` on drift. The command handles one thread at a time; invoke it in sequence for multi-suggestion PRs, then push all the resulting commits together. See the `commit-suggestion` section in the [CLI reference](cli-usage.md#pr-shepherd-commit-suggestion-pr---thread-id-id---message) for flags and output format.

**What the monitor does:** Follow `## Instructions` in order. The instructions are self-contained and action-specific — no dispatch table needed in the monitor. See `## Instructions` in the output for the exact steps.

---

## `escalate`

Ambiguous state that requires human judgement — the monitor stops and surfaces details.

**Trigger:** Any of:

- **`stall-timeout`** — the iterate result has not materially changed for `config.iterate.stallTimeoutMinutes` minutes (default 30). Catches loops where the same failing test, transient error, or pending state repeats indefinitely without progress. The timer resets whenever the HEAD SHA, failing-check set, or actionable item IDs change. Override with `--stall-timeout <duration>` (e.g. `--stall-timeout 1h`).
- **`fix-thrash`** — same thread dispatched ≥ `config.iterate.fixAttemptsPerThread` times (default 3) without resolving.
- **`pr-level-changes-requested`** — reviewer requested changes but left no inline threads, comments, or CI failures to act on (not triggered when merge conflicts are present).
- **`thread-missing-location`** — an actionable review thread has no file or line reference, so the code location cannot be found automatically.
- **`base-branch-unknown`** — the GraphQL batch did not yield a usable base branch name: the derived value was empty or contained unsafe characters. Preempts both `[REBASE]` and any `[FIX_CODE]` that would require a push, since rebasing onto the wrong base is worse than pausing the monitor.

**CLI side-effects:** None.

**Exit code:** 3

**Markdown output:**

```markdown
# PR #42 [ESCALATE]

**status** `UNRESOLVED_COMMENTS` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

⚠️ /pr-shepherd:monitor paused — needs human direction

**Triggers:** `fix-thrash`

Same thread(s) attempted multiple times without resolution — fix manually then rerun /pr-shepherd:monitor

## Items needing attention

- thread `PRRT_kwDOSGizTs58XB1L` — `src/commands/iterate.mts:42` (@alice): The variable name is misleading

## Fix attempts

- thread `PRRT_kwDOSGizTs58XB1L` attempted 3 times

---

Run `/pr-shepherd:check 42` to see current state.
After fixing manually, rerun `/pr-shepherd:monitor 42` to resume.

## Instructions

1. Invoke `/loop cancel` via the Skill tool.
2. Stop — the PR needs human direction before monitoring can resume.
```

The block after the base-fields line (separated by a blank line) is `escalate.humanMessage` in JSON — ready to print verbatim.

**What the monitor does:** Follow `## Instructions` — invoke `/loop cancel` via Skill tool to stop the cron job.

---

## Archived / no longer emitted

### `rerun_ci`

> **This action is no longer emitted by `iterate`.** Transient CI failure detection (timeout / cancelled) has been moved to the agent: the `fix_code` action now carries `jobName` and `logTail` for every failing check, and the `## Instructions` section tells the agent to examine the log and decide whether to run `gh run rerun <runId> --failed` or apply a code fix. Current releases no longer include a `rerun_ci` action or `[RERUN_CI]` formatter output.

**Trigger:** Previously emitted when one or more failing checks had `failureKind === "timeout"` or `"cancelled"` and no actionable work was found. Removed in favour of routing all failing checks through `fix_code` with raw log data.

### `rebase`

> **This action is no longer emitted by `iterate`.** Branch rebasing is now handled inside the `fix_code` instructions (see `## Post-fix push` and the rebase step in `## Instructions`). Current releases no longer include a dedicated `rebase` action or `[REBASE]` formatter output.

**Trigger:** Previously emitted when a branch was `BEHIND` its base and no other actionable items were pending. Removed in favour of embedding the rebase step inside `fix_code` when conflicts are present.
