# shepherd actions

[← README](../README.md)

Each default `pr-shepherd` invocation returns exactly one iterate action. The legacy `pr-shepherd iterate` spelling is still supported. See [docs/iterate-flow.md](iterate-flow.md) for the decision order.

The default output format is Markdown — what you see when running `npx pr-shepherd <PR>`, and what the monitor SKILL reads each cron tick. `--format=json` emits the same information as a single JSON object for scripting. Every example below shows what the agent actually sees in the default (lean) format.

Instruction wording is agent-aware. Claude-compatible output refers to the next cron fire and `/loop cancel`. Codex output is selected with `AGENT=codex` or `CODEX_CI=1`; it replaces those lines with active-goal guidance such as waiting about the configured interval (`watch.interval`, default 4m) and rerunning `npx pr-shepherd <PR>`. The action data and section structure are otherwise the same.

Pass `--verbose` to get more debug state. In JSON mode, the output starts from the full `IterateResult` shape (all fields, including `baseBranch`, `checks`, `shouldCancel`) and then applies the same agent-aware instruction projection as lean JSON: non-`fix_code` actions get a top-level `instructions` array, and Codex output may rewrite `fix.instructions` and simple-action instructions. In Markdown mode, `--verbose` restores the full header summary line (all four counts, `remainingSeconds`, `copilotReviewInProgress`, `isDraft`, `shouldCancel` always shown, and `[COOLDOWN]` no longer suppresses the base/summary block) — but Markdown is structurally different from JSON and does not guarantee field-for-field parity (array fields like `baseBranch` or `checks` are not added to Markdown for actions that do not normally render them). Lean mode is the default because most fields are `false`/`0`/`[]` on a typical healthy tick and add context noise without value.

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

**Note on `mergeStatus` in JSON lean mode.** The lean JSON projection (`--format=json`, default) emits `mergeStateStatus` (the raw GitHub value) but **omits the derived `mergeStatus` discriminator** (`CLEAN | BEHIND | CONFLICTS | BLOCKED | UNSTABLE | DRAFT | UNKNOWN`). Scripts that branch on `mergeStatus` must use `--verbose` to get the full `IterateResult`. `mergeStateStatus` is always present in both modes.

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

Codex variant: `Continue the active Codex goal — wait about the configured interval (4m), then rerun \`npx pr-shepherd 42\` after CI starts reporting.`

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

Codex variant: the body omits `until auto-cancel`, and the instruction is `Continue the active Codex goal — wait about the configured interval (4m), then rerun \`npx pr-shepherd 42\` to recheck.`

When the current command includes a ready-delay override, Codex rerun guidance preserves it: `npx pr-shepherd 42 --ready-delay 15m`.

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

Codex variant: the same instruction with added active-goal guidance to continue until the ready-delay completes, wait about the configured interval (4m), and rerun `npx pr-shepherd 42` to recheck.

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

Codex variant: `Stop — no recurring Codex monitor is running to cancel.` followed by `Stop.`

Other heading variants: `# PR #42 [CANCEL] — closed`, `# PR #42 [CANCEL] — ready-delay-elapsed`.

Other body-line variants: `CANCEL: PR #42 is closed — stopping monitor`, `CANCEL: PR #42 has been ready for review — ready-delay elapsed, stopping monitor`.

**What the monitor does:** Follow `## Instructions` — invoke `/loop cancel` via Skill tool to stop the cron job.

---

## `fix_code`

Actionable work needs a code fix, commit, and push.

**Trigger:** Any of: unresolved inline review threads, resolution-only inline review threads, actionable PR-level comments, `CHANGES_REQUESTED` reviews, any failing CI check, merge conflicts (`mergeStatus.status === "CONFLICTS"`), or pending review summary IDs to minimize (both first-look and already-seen). Failing checks of all types (timeout, cancelled, actionable) route here — the agent runs `gh run view <runId> --log-failed` when it needs logs, and follows the `[conclusion: CANCELLED]` instruction for externally cancelled runs.

**CLI side-effects:** Issues a `POST /repos/{owner}/{repo}/actions/runs/{runId}/cancel` REST call for each unique run ID of failing CI checks (best-effort; already-completed runs return 409 and are silently ignored). **Important:** this cancellation runs on the pre-push run IDs recorded in the sweep — do not re-cancel these IDs after you push, because the push replaces them with fresh runs whose IDs differ.

**Exit code:** 1

**Markdown output:**

```markdown
# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 3 passing

## Review threads

### `threadId=PRRT_kwDOSGizTs58XB1L` — `src/commands/iterate.mts:42` (@alice)

> The variable name is misleading.
>
> Consider renaming `x` to `remainingSeconds` so readers don't have to
> trace back to the declaration to understand its meaning.

## Actionable comments

### `commentId=IC_kwDOSGizTs7_ajT8` (@bob)

> Consider using a more descriptive name here.

## Failing checks

- `24697658766` — `CI › lint / typecheck / test (22.x)` [conclusion: FAILURE]

  > Run tests
  > 2 tests failed

- `24697658767` — `CI › build` [conclusion: CANCELLED]

## Changes-requested reviews

- `reviewId=PRR_kwDOSGizTs58XB1R` (@alice)

## In-progress runs

- `24697658764`

## Cancelled runs

- `24697658765`

## Post-fix push

- base: `main`
- resolve: `npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_kwDOSGizTs58XB1L --minimize-comment-ids IC_kwDOSGizTs7_ajT8 --dismiss-review-ids PRR_kwDOSGizTs58XB1R --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Cancel in-progress CI runs first: for each ID under `## In-progress runs`, run `gh run cancel <id>`. Do this before applying any code fixes — the push at the end of this iteration will supersede those runs anyway, so letting them continue burns CI minutes for results no one will read. If `gh` reports a run is already completed, ignore it and continue with the next ID.
2. Apply code fixes: read and edit each file referenced under `## Review threads` and `## Actionable comments` above.
3. For each failing check under `## Failing checks` with a run ID and no `[conclusion: CANCELLED]` tag: run `gh run view <runId> --log-failed` to fetch the failing job's log.
4. If the log shows a transient infrastructure failure (network timeout, runner setup crash, OOM kill): run `gh run rerun <runId> --failed`.
5. If the log shows a real test/build failure: apply a code fix.
6. For each `[conclusion: CANCELLED]` bullet under `## Failing checks`: the run was cancelled outside Shepherd's control (manual cancel, newer push, concurrency-group eviction). Run `gh run rerun <runId>` only if the cancellation looks unintended; otherwise treat it as resolved by the superseding run. Do NOT confuse these with IDs under `## Cancelled runs` — those were cancelled by Shepherd itself.
7. For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes.
8. Commit changed files: `git add <files> && git commit -m "<descriptive message>"`
9. Keep the PR title and description current: if the changes alter the PR's scope or intent, run `gh pr edit 42 --title "<new title>" --body "<new body>"` to reflect them. Skip if the existing title/body still accurately describe the PR.
10. Rebase and push: `git fetch origin && git rebase origin/main && git push --force-with-lease` — capture `HEAD_SHA=$(git rev-parse HEAD)`
11. Run the `resolve:` command shown above, substituting "$HEAD_SHA" with the pushed commit SHA and $DISMISS_MESSAGE with a one-sentence description of what you changed.
12. Do not re-run `gh run cancel` on the IDs listed under `## Cancelled runs` — the CLI cancelled those runs before your push, and your push has already triggered new runs with different IDs.
13. For any large decisions or rejections you made this iteration, add or update a `## Shepherd Journal` section in the PR description (`gh pr edit 42 --body …`) summarizing each decision and linking back to the originating comment, thread, or review.
14. Stop this iteration — CI needs time to run on the new push before the next tick.
```

When one or more threads carry a `[suggestion]` marker, the `## Instructions` section opens with two different steps. Step 1 is new; step 2 gains a manual-fallback clause. All other steps renumber and are otherwise unchanged.

```markdown
## Instructions

1. For each thread marked `[suggestion]` under `## Review threads`: run `npx pr-shepherd commit-suggestion 42 --thread-id <id> --message "<one-sentence headline>" --format=json` to retrieve the patch and suggested commit. The CLI does not mutate the working tree — apply the patch yourself (run `git apply` with the diff shown, or edit the file directly using the line range), then stage the listed file and run the suggested `git commit` from the `## Instructions` section. Include the thread ID in `--resolve-thread-ids` in the `resolve:` command below (the thread is not auto-resolved). If the patch fails to apply, fall through to the manual-edit step. Do not retry the same command.
2. Apply code fixes: read and edit each file referenced under `## Review threads` and `## Actionable comments` above. When applying a `[suggestion]` thread manually (e.g. when a patch fails to apply), replace the exact line range shown in the heading (`path:startLine-endLine`) with the replacement shown in its `Replaces lines …` block verbatim — an empty replacement deletes those lines, a single blank line replaces the range with one blank line.
3. [remaining steps — failing checks, reviews, commit, rebase/push, resolve, cancelled-runs guard, journal, stop — renumber starting here]
```

Step 1 is absent when no thread has a `[suggestion]` marker; step 2 omits the manual-fallback clause in the same case.

**Section order:**

1. Heading + base fields (always present).
2. `## Review threads` — each thread under ``### `threadId=<id>` — <loc> (@author) [suggestion]?`` (or `### [threadId=<id>](<url>) — <loc> (@author) [suggestion]?` when a URL is available) where `<loc>` is `` `path:line` `` for single-line threads or `` `path:startLine-endLine` `` for multi-line threads. The full body follows as a `>` blockquote. Multi-paragraph bodies preserve empty lines as `>` lines. Threads with a ` ```suggestion ` fence carry a `[suggestion]` tag in the heading and a `Replaces lines …` block after the body showing the parsed replacement.
3. `## Actionable comments` — same H3-plus-blockquote shape as threads minus the `<loc>`: ``### `commentId=<id>` `` or `### [commentId=<id>](<url>)` when a URL is available.
4. `## Failing checks` — one bullet per failing check. Shape varies by locator:
   - ``- `<runId>` — `<workflowName> › <jobName>` `` for GitHub Actions checks (`workflowName ›` prefix omitted when unavailable; `jobName` falls back to the check name when absent).
   - ``- external `<detailsUrl>` — `<name>` `` for external status checks (codecov, vercel, etc.) with null `runId` but a URL.
   - ``- (no runId) — `<name>` `` when both are null.

   Every bullet carries a `[conclusion: <CONCLUSION>]` tag (e.g. `[conclusion: FAILURE]`, `[conclusion: TIMED_OUT]`, `[conclusion: CANCELLED]`); null conclusions produce no tag. Non-CANCELLED bullets may also carry a `> <failedStep>` blockquote line (the first step that failed, GitHub Actions only) and a `> <summary>` blockquote line (one-line status text from the GitHub UI), both omitted when not available.

   The numbered instructions split accordingly: for GitHub Actions checks with a runId and no `[conclusion: CANCELLED]`, three steps are emitted — fetch logs with `gh run view <runId> --log-failed`, rerun with `gh run rerun <runId> --failed` if transient, or apply a code fix if a real failure. For `[conclusion: CANCELLED]` checks, a single step says to rerun with `gh run rerun <runId>` (no `--failed` flag) if the cancellation looks unintended. For external status checks (detailsUrl only), the step says to open the URL in a browser. When both are absent, the step says to escalate to a human.

5. `## Review threads to resolve` — unresolved outdated/minimized inline threads that should be passed to `--resolve-thread-ids` but do not require code edits unless the agent chooses to act on the body.
6. `## Changes-requested reviews` — one bullet per `CHANGES_REQUESTED` review: ``- `reviewId=<id>` (@<author>)``.
7. `## Review summaries (first look — to be minimized)` — `COMMENTED` review summaries the agent has **not yet seen**. Each entry is rendered with an H3 heading (``### `reviewId=<id>` (@<author>)``) and the full body as a `>` blockquote. Their IDs are already included in `--minimize-comment-ids` in the resolve command, so no additional action is needed beyond reading them and recording any Shepherd Journal note. A per-item seen-marker file (`src/state/seen-comments.mts`) writes the marker on first encounter so subsequent runs skip the body. Not emitted when empty.
8. `## Review summaries (edited since first look — already minimized; do not re-minimize)` — `COMMENTED` review summaries whose body was edited by the author after Shepherd last surfaced them. Each entry is rendered the same way as section 7 (H3 heading + `>` blockquote). These IDs are **NOT** included in `--minimize-comment-ids` — the review is already minimized on GitHub (or was in a prior iteration's minimize queue). Read the updated body and record any Shepherd Journal note, but do not pass these IDs to any mutation flag. The seen-marker hash is updated after display so the next run only re-surfaces them if the body changes again. Not emitted when empty.
9. `## Review summaries (already surfaced — minimize queue)` — backticked review IDs (`PRR_…`) of `COMMENTED` review summaries whose bodies were surfaced in a **prior** iteration and whose body has not changed since. If `iterate.minimizeApprovals` is `true`, this section may also include `APPROVED` review IDs queued for minimization even though their bodies were not previously surfaced. All IDs (from sections 7 and 9) are merged into `--minimize-comment-ids` in the resolve command. Not emitted when empty.
10. `## Approvals (surfaced — not minimized)` — emitted when `iterate.minimizeApprovals` is `false` (default) and there are `APPROVED`-state reviews. H3 heading uses `` `reviewId=<id>` `` (same prefix scheme as other item types); body is a `>` blockquote or `(no review body)` when empty. Surfaced for visibility, but NOT included in `--minimize-comment-ids`.
11. `## First-look items (N) — acknowledge status before acting` — threads and PR comments that are outdated, resolved, or minimized and have not yet been acknowledged by the agent. Emitted on first encounter only; a per-item seen-marker file (`src/state/seen-comments.mts`) suppresses them on subsequent runs. Each bullet carries a `[status: …]` tag: `outdated`, `outdated, auto-resolved`, `resolved`, or `minimized`. If the body was edited since the item was first acknowledged, the tag gains an `, edited` suffix (e.g. `[status: minimized, edited]`). If a first-look thread also appears under `## Review threads to resolve`, its ID is already included in the resolve command; otherwise do not pass first-look-only IDs to mutation flags. Not emitted when empty.
12. `## In-progress runs` — backticked GitHub Actions run IDs of in-progress checks the agent should cancel before applying fixes. Emitted only when `fix.inProgressRunIds` is non-empty, which requires both (a) at least one in-progress check with a non-null run ID not already cancelled by the CLI and (b) a push is guaranteed this iteration (review threads, failing checks, changes-requested reviews, or rebase conflicts). Comment-only iterations do not emit this section because the agent may only minimize or acknowledge comments without making a superseding push. The agent cancels these before applying code fixes (step 1 of `## Instructions`). Distinct from `## Cancelled runs`: those IDs were already cancelled by the CLI before the agent acts; these IDs the agent must cancel itself now. Not emitted when empty.
13. `## Cancelled runs` — backticked IDs, emitted only when at least one pre-push REST cancellation succeeded.
14. `## Post-fix push`:
    - ``- base: `<branch>` `` — rebase target for the push step.
    - ``- resolve: `<argv>` `` — fully-quoted resolve command. `$DISMISS_MESSAGE` and `$HEAD_SHA` are always quoted so substituting a multi-word sentence keeps it as one argument. `--require-sha "$HEAD_SHA"` is appended only when a push is required (threads/checks/reviews present); comment-only and summary-only dispatches omit it.
15. `## Instructions` — numbered list to execute in order. The final instruction always refers back to the `resolve:` bullet rather than duplicating the command — that single source of truth is what the monitor executes.

**Instruction variants:**

- A "Cancel in-progress CI runs first" step is prepended as step 1 when `fix.inProgressRunIds` is non-empty (i.e. at least one in-progress GitHub Actions run will be superseded by a guaranteed push this iteration). It instructs the agent to run `gh run cancel <id>` for each ID under `## In-progress runs` before applying any code fixes. When absent (no in-progress run IDs, or no guaranteed push), step numbers start at 1 with the `commit-suggestion` or `Apply code fixes:` step.
- The `commit-suggestion` step is emitted only when at least one `## Review threads` entry carries a `[suggestion]` marker (`threads.some(t => t.suggestion)`). When absent, the next step is `Apply code fixes:`.
- The `Apply code fixes:` step gains a manual-fallback clause — "When applying a `[suggestion]` thread manually …" — only when the `commit-suggestion` step is also present. When no suggestions are present, the step is the plain one-liner.
- `Commit changed files:` is only emitted when there are actual code changes to commit (threads/comments/checks/reviews present). A `CONFLICTS`-only state skips this step.
- `Keep the PR title and description current:` is emitted immediately after the commit step and uses the same gate (`hasCodeChanges`). A `CONFLICTS`-only dispatch (no code to commit) omits it.
- The rebase step switches wording based on `mergeStatus.status`. When conflicts are present it emits "Rebase with conflict resolution" and walks through `git rebase --continue` loops; otherwise it emits the clean one-liner `git fetch origin && git rebase origin/<base> && git push --force-with-lease`.
- `## Failing checks` generates one or more instruction steps per locator/conclusion type present. When non-cancelled checks have a `runId`, three steps are emitted: (1) fetch the log with `gh run view <runId> --log-failed`, (2) rerun with `gh run rerun <runId> --failed` if the log shows a transient infrastructure failure, (3) apply a code fix if the log shows a real test/build failure. When a check has `conclusion === "CANCELLED"` with a `runId`, a single separate step says to rerun with `gh run rerun <runId>` (no `--failed`) if the cancellation looks unintended. When a check has only a `detailsUrl` (external status check — no `runId`), the step says to open the URL in a browser. When both are absent, the step says to escalate to a human.
- The `resolve:` instruction is emitted when `resolveCommand.hasMutations` is true — i.e. when at least one of `threads`, `resolutionOnlyThreads`, `actionableComments`, or `reviewSummaryIds` is non-empty. Summary-only dispatches also emit the instruction. A `CONFLICTS`-only dispatch (none of those non-empty) omits it.
- A "do not re-run cancelled runs" instruction is appended when `cancelled` is non-empty and a push is required — it reminds the monitor that those IDs were cancelled pre-push and new runs have since been triggered.
- A `For any large decisions or rejections …` (Shepherd Journal) instruction is appended when `resolveCommand.hasMutations` is true — i.e. when at least one of threads, resolution-only threads, actionable comments, or review summary IDs is non-empty. It asks the agent to add or update a `## Shepherd Journal` section in the PR description (`gh pr edit <N> --body …`) summarizing each decision and linking back to the originating comment, thread, or review. Conflicts-only dispatches (none of those non-empty) omit it.
- A first-look acknowledgement step is appended when `firstLookThreads` or `firstLookComments` are non-empty — it tells the agent to acknowledge current status before acting and to rely on `## Review threads to resolve` for any resolve mutation IDs.
- A first-look summaries step is appended when `firstLookSummaries` is non-empty — it tells the agent these summaries are being seen for the first time and their IDs are already in the resolve command's `--minimize-comment-ids`.
- An edited-items step is appended when `editedSummaries` is non-empty or any first-look thread/comment carries `edited: true` — it tells the agent to read the updated body but **not** include these IDs in any mutation flag.
- The final "iteration" step has three variants: `Stop this iteration — CI needs time to run on the new push before the next tick.` when a push occurred; `Stop this iteration before the next tick.` when only GitHub mutations were made (no push); `End this iteration.` when no push or mutations occurred.
- In Codex output, the "next tick" variants are rewritten to tell Codex to continue the active goal, wait about the configured interval (`watch.interval`, default 4m), and rerun `npx pr-shepherd <PR>`.

The JSON payload exposes the same data under `fix.{threads, resolutionOnlyThreads, actionableComments, reviewSummaryIds, firstLookSummaries, editedSummaries, surfacedApprovals, checks, changesRequestedReviews, resolveCommand, instructions, mode, firstLookThreads, firstLookComments, inProgressRunIds}` — where `fix.mode === "rebase-and-push"` is the type discriminator — plus top-level `baseBranch` (on `IterateResultBase`, not under `fix`) and `cancelled`. `fix.inProgressRunIds` contains the GitHub Actions run IDs the agent must cancel before applying fixes (mirrors `## In-progress runs` in the Markdown output); it is an empty array when there are no in-progress GitHub Actions run IDs to cancel (external status checks or already-cancelled runs are excluded) or when no push is expected this iteration. `resolutionOnlyThreads` contains unresolved outdated/minimized review threads routed to `--resolve-thread-ids` without causing a push or `--require-sha`. `reviewSummaryIds` contains the IDs routed to `--minimize-comment-ids` for review-level minimization: this includes review summaries (both first-look and already-seen), and may also include APPROVED review IDs when approval minimization is enabled. `firstLookSummaries` carries the full `Review` objects for bodies seen this iteration for the first time. `editedSummaries` carries the full `Review` objects for summaries whose body changed since last seen — these IDs are **not** in `reviewSummaryIds`. Both `firstLookSummaries` and `reviewSummaryIds` are merged into `--minimize-comment-ids` inside `resolveCommand.argv`; `editedSummaries` and `surfacedApprovals` are informational only. In lean JSON mode, `fix.*` arrays that are empty are omitted; `cancelled` is omitted when empty. Pass `--verbose` to include all fields. `firstLookThreads` and `firstLookComments` are informational unless the same thread appears in `resolutionOnlyThreads`.

**Resolve command rules (same in Markdown and JSON):**

- `--require-sha "$HEAD_SHA"` is appended only when threads, CI failures, or changes-requested reviews are present — signals the CLI knows require a push. Comment-only and summary-only dispatches omit it.
- `$DISMISS_MESSAGE` must be one specific sentence describing what changed — never generic text like "address review comments".

### Applying ` ```suggestion ` blocks

GitHub reviewers can leave ` ```suggestion ` fenced blocks in review thread bodies. The CLI parses these and surfaces them in two additions to each thread:

- A `[suggestion]` marker on the heading.
- A `Replaces line(s) …` block immediately after the blockquoted body, showing the parsed replacement. An empty suggestion (deletion) uses the label `Replaces line(s) … with nothing:` followed by an empty fenced block.

When at least one thread has a `[suggestion]` marker, the agent sees these two instruction steps. The CLI substitutes the real PR number; `<id>` and `<one-sentence headline>` are left for the agent to fill in.

**Step 1 — structured path (preferred):**

> For each thread marked `` `[suggestion]` `` under `` `## Review threads` ``: run `` `npx pr-shepherd commit-suggestion 42 --thread-id <id> --message "<one-sentence headline>" --format=json` `` to retrieve the patch and suggested commit. The CLI does not mutate the working tree — apply the patch yourself (run `git apply` with the diff shown, or edit the file directly using the line range), then stage the listed file and run the suggested `git commit` from the `## Instructions` section. Include the thread ID in `--resolve-thread-ids` in the `resolve:` command below (the thread is not auto-resolved). If the patch fails to apply, fall through to the manual-edit step. Do not retry the same command.

`commit-suggestion` builds a unified diff from the `Replaces lines …` block and emits the suggested commit message and body (with a `Co-authored-by: <reviewer>` trailer) in a `## Suggested commit message` section, plus numbered `## Instructions` telling the agent exactly what to run. It handles one thread at a time; for multi-suggestion PRs invoke it in sequence, then push all commits together.

**Step 2 — manual fallback (apply code fixes step, with suggestion clause):**

> Apply code fixes: read and edit each file referenced under `` `## Review threads` `` and `` `## Actionable comments` `` above. When applying a `` `[suggestion]` `` thread manually (e.g. when a patch fails to apply), replace the exact line range shown in the heading (`path:startLine-endLine`) with the replacement shown in its `Replaces lines …` block verbatim — an empty replacement deletes those lines, a single blank line replaces the range with one blank line.

When a patch fails to apply (drift since the suggestion was written), use the `Replaces lines …` block from the iterate output to apply the change directly. Do not retry `commit-suggestion`.

---

**Single-line suggestion.** Heading `src/foo.ts:42`:

````markdown
### `threadId=PRRT_kwDOSGizTs58XB1L` — `src/foo.ts:42` (@alice) [suggestion]

> Rename `x` to `remainingSeconds` so readers don't have to trace back to the declaration.
>
> ```suggestion
> const remainingSeconds = computeRemaining();
> ```

Replaces line 42:

```
const remainingSeconds = computeRemaining();
```
````

Structured path: run `npx pr-shepherd commit-suggestion 42 --thread-id PRRT_kwDOSGizTs58XB1L --message "rename x to remainingSeconds" --format=json`, then follow the `## Instructions` in the output (apply patch → `git add` → `git commit` → include ID in `pr-shepherd resolve`). Manual fallback: open `src/foo.ts` and replace line 42 with `const remainingSeconds = computeRemaining();`.

**Multi-line suggestion.** When the thread spans a range, the heading shows `path:startLine-endLine` (e.g. `src/foo.ts:40-42`). The `Replaces lines 40–42:` block contains the replacement spliced in for that entire range. An empty block means "delete those lines"; a block containing a single blank line means "replace with one blank line".

````markdown
### `threadId=PRRT_kwDOSGizTs58XB2M` — `src/foo.ts:40-42` (@alice) [suggestion]

> Collapse these three assignments into one.
>
> ```suggestion
> const result = computeAll();
> ```

Replaces lines 40–42:

```
const result = computeAll();
```
````

Structured path: run `npx pr-shepherd commit-suggestion 42 --thread-id PRRT_kwDOSGizTs58XB2M --message "collapse three assignments" --format=json`, then follow the `## Instructions` in the output. Manual fallback: replace lines 40–42 in `src/foo.ts` with `const result = computeAll();`.

**Multiple suggestions (two or more threads).** Invoke `commit-suggestion` once per thread in sequence. Each invocation returns a patch + commit instructions; the agent applies each patch and commits before moving to the next. Include all thread IDs in `--resolve-thread-ids` — the CLI no longer auto-resolves threads. Push all commits together after all threads are handled.

````markdown
## Review threads

### `threadId=PRRT_kwDOSGizTs58XB1L` — `src/foo.ts:42` (@alice) [suggestion]

> ```suggestion
> const remainingSeconds = computeRemaining();
> ```

Replaces line 42:

```
const remainingSeconds = computeRemaining();
```

### `threadId=PRRT_kwDOSGizTs58XC2M` — `src/bar.ts:17` (@alice) [suggestion]

> ```suggestion
> return value ?? defaultValue;
> ```

Replaces line 17:

```
return value ?? defaultValue;
```
````

The `resolve:` command at the bottom of `## Post-fix push` includes both IDs:

```
- resolve: `npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_kwDOSGizTs58XB1L,PRRT_kwDOSGizTs58XC2M --require-sha "$HEAD_SHA" --message "$DISMISS_MESSAGE"`
```

Both IDs stay in `--resolve-thread-ids` — `commit-suggestion` no longer resolves threads automatically. If a patch failed to apply and was handled manually instead, the ID still belongs in `--resolve-thread-ids`.

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

Codex variant: `Stop — no recurring Codex monitor is running to cancel.` followed by the same human-direction stop instruction.

The block after the base-fields line (separated by a blank line) is `escalate.humanMessage` in JSON — ready to print verbatim.

**What the monitor does:** Follow `## Instructions` — invoke `/loop cancel` via Skill tool to stop the cron job.

---

## Archived / no longer emitted

### `rerun_ci`

> **This action is no longer emitted by `iterate`.** Transient CI failure detection (timeout / cancelled) has been moved to the agent: the `fix_code` action now carries `failedStep`/`conclusion` for every failing check, and the `## Instructions` section tells the agent to run `gh run view <runId> --log-failed` and decide whether to rerun or apply a code fix. Current releases no longer include a `rerun_ci` action or `[RERUN_CI]` formatter output.

**Trigger:** Previously emitted when one or more failing checks had `failureKind === "timeout"` or `"cancelled"` and no actionable work was found. Removed in favour of routing all failing checks through `fix_code` with raw log data.

### `rebase`

> **This action is no longer emitted by `iterate`.** Branch rebasing is now handled inside the `fix_code` instructions (see `## Post-fix push` and the rebase step in `## Instructions`). Current releases no longer include a dedicated `rebase` action or `[REBASE]` formatter output.

**Trigger:** Previously emitted when a branch was `BEHIND` its base and no other actionable items were pending. Removed in favour of embedding the rebase step inside `fix_code` when conflicts are present.
