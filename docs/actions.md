# shepherd actions

[← README](../README.md)

Each default `pr-shepherd` invocation returns exactly one iterate action. The legacy `pr-shepherd iterate` spelling is still supported. See [docs/iterate-flow.md](iterate-flow.md) for the decision order.

The default output format is Markdown — what you see when running `pr-shepherd <PR>` through the selected package runner, and what the iterate skill reads on each tick. `--format=json` emits the same information as a single JSON object for scripting. Every example below shows what the agent actually sees in the default (lean) format.

Instruction wording is runtime-specific. Claude-compatible output schedules exactly one next session-only iteration after a fresh delay between 30 seconds and 4 minutes, then ends the turn. Codex-compatible output sleeps inline for that delay, then reruns the configured pr-shepherd command. The action data and section structure are otherwise the same.

Three iteration strategies are valid: (a) inline sleep + rerun (Codex default); (b) scheduled session-only follow-up (Claude default); (c) the blocking `pr-shepherd poll` command, which loops with `--interval`/`--timeout` until a non-WAIT action appears. Do not run `while true` or unbounded polling loops outside of `pr-shepherd poll`.

Command examples use the default npm spelling (`npx pr-shepherd`). Repos can set `cli.runner` to `auto`, `npx`, `pnpm`, `yarn`, or `bun`; generated text and JSON argv then use the selected runner (for example `pnpm exec pr-shepherd`, `yarn run pr-shepherd`, or `bunx pr-shepherd`) everywhere a pr-shepherd follow-up command is emitted.

Pass `--verbose` to get more debug state. In JSON mode, the output starts from the full `IterateResult` shape (all fields, including `baseBranch`, `checks`, `shouldCancel`) and then applies the same instruction projection as lean JSON: non-`fix_code` actions get a top-level `instructions` array, and `fix.instructions` may be rewritten. In Markdown mode, `--verbose` restores the full header summary line (all four counts, `remainingSeconds`, `blockingBotReviewInProgress`, `isDraft`, `shouldCancel` always shown) — but Markdown is structurally different from JSON and does not guarantee field-for-field parity (array fields like `baseBranch` or `checks` are not added to Markdown for actions that do not normally render them). Lean mode is the default because most fields are `false`/`0`/`[]` on a typical healthy tick and add context noise without value.

**Output shape (every action, default lean format):**

```
# PR #<N> [ACTION]

**status** `<…>` · **merge** `<…>` · **state** `<…>` · **repo** `<…>`
**summary** <N> passing[, <N> skipped][, <N> filtered][, <N> inProgress][· **remainingSeconds** <N>][· **blockingBotReviewInProgress**][· **isDraft**]
[**branch** behind `origin/<base>` | **branch** conflicts with `origin/<base>`]
[**required** [approvals `<N>`][, conversation-resolution required][, checks: `<ctx>`, …]]

<action-specific body>

## Instructions

1. <numbered steps telling the agent exactly what to do>
```

Lean-mode rules for the summary line:

- Zero counts (`skipped`, `filtered`, `inProgress`) are omitted.
- `remainingSeconds` is shown only when the ready-delay timer is actively counting down (`status === "READY"` and `remainingSeconds > 0`).
- `blockingBotReviewInProgress` and `isDraft` are shown only when `true`.
- `shouldCancel` is never shown (it is fully implied by `action === "cancel"`).

The `**branch**` line is emitted only on `fix_code` and `wait` actions when `mergeStatus.status` is `"BEHIND"` or `"CONFLICTS"`. It surfaces the raw branch state so the agent can decide whether to rebase without further tool calls.

The `**required**` line is emitted only when branch-protection rules are non-trivial (any of: approvals required, conversation-resolution required, or required check contexts present). When all fields are at their trivial defaults the line is omitted. Fields: `approvals \`<N>\`` when `requiredApprovingReviewCount > 0`, `conversation-resolution required` when `requiresConversationResolution`, `checks: \`<context>\`, …` listing required status-check context names. The agent cross-references this line against per-check bullets in `## Failing checks` to know which checks are gating merge.

`--verbose` restores the full summary line: all four counts, `remainingSeconds`, `blockingBotReviewInProgress`, `isDraft`, and `shouldCancel` always present.

**Note on `mergeStatus` in JSON lean mode.** The lean JSON projection (`--format=json`, default) emits `mergeStateStatus` (the raw GitHub value) but **omits the derived `mergeStatus` discriminator** (`CLEAN | BEHIND | CONFLICTS | BLOCKED | UNSTABLE | DRAFT | UNKNOWN`). Scripts that branch on `mergeStatus` must use `--verbose` to get the full `IterateResult`. `mergeStateStatus` is always present in both modes.

Load-bearing conventions (the iterate skill depends on these):

1. Line 1 is always an H1 heading of the form `# PR #<N> [<ACTION>]`. The action tag identifies the output for logging and validation — behavior is driven by the `## Instructions` section, not by dispatching on the tag.
2. Lines 3–4 carry the base fields (status, merge, state, repo, summary). In lean mode, fields at their trivial default are omitted; `--verbose` restores the full scalar header/summary line in Markdown. JSON verbose mode returns the complete `IterateResult` including fields not present in Markdown (e.g. `baseBranch`, `checks` on all actions); Markdown is structurally lossy relative to JSON and `--verbose` does not close that gap.
3. Every action ends with a `## Instructions` section — numbered `1.`, `2.`, … — that tells the agent exactly what to do. The skill follows those steps; it does not need its own dispatch table.
4. Under `[FIX_CODE]`, the `## Post-fix push` section has a `` resolve: `<command>` `` bullet — the instructions reference this bullet so the skill strips backticks and runs the command.
5. Passing check counts are surfaced only via the `**summary**` line — no per-check detail is emitted for passing checks. Failing check detail appears in `## Failing checks` (within `[FIX_CODE]` output). JSON surfaces check data as `checks: RelevantCheck[]` only on `fix_code` actions in lean mode; `--format=json --verbose` includes `checks` on all actions (full IterateResult).

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

1. Single-shot continuation: schedule one session-only follow-up task to run `npx pr-shepherd 42` to continue the active goal once after a fresh delay between 30 seconds and 4 minutes, then end this turn. Do not sleep or rerun inline.
```

When the current command includes a ready-delay override, the rerun command preserves it: `npx pr-shepherd 42 --ready-delay 15m`.

The body line (`WAIT: …`) varies with the merge state — `branch is behind base`, `blocked by pending reviews or required status checks`, `PR is a draft`, or `some checks are unstable`.

**What the skill does:** Follow `## Instructions`. For the Claude-compatible output shown above, schedule exactly one next session-only iteration and end the turn; Codex-compatible output sleeps inline and reruns the same command. Alternatively, run `<runner> pr-shepherd poll <N>` to block until the action is non-WAIT (bounded by `--timeout`).

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

1. The CLI already marked the PR ready for review. Single-shot continuation: schedule one session-only follow-up task to run `npx pr-shepherd 42` to recheck once after a fresh delay between 30 seconds and 4 minutes, then end this turn. Do not sleep or rerun inline.
```

**What the skill does:** Follow `## Instructions`. For the Claude-compatible output shown above, schedule exactly one next session-only iteration and end the turn; Codex-compatible output sleeps inline and reruns the same command. Do not run `while true` or unbounded polling loops outside of `pr-shepherd poll`.

---

## `cancel`

Stops the iterate loop — no further iterations needed.

**Trigger:** Either the PR is merged or closed (`state !== "OPEN"`), or the ready-delay timer elapsed after the current sweep still verifies the PR as a READY handoff state. Candidate READY reports get a fresh mergeability read before the timer can complete, so newly detected conflicts route to `fix_code` instead of `cancel`.

**CLI side-effects:** Deletes any stale `ready-since.txt` marker when the PR is merged/closed or when ready-delay elapses.

**Exit code:** 2

**`reason` field:** The result carries a structured `reason` discriminator — `"merged"`, `"closed"`, or `"ready-delay-elapsed"` — as a first-class field in both JSON and Markdown output. JSON consumers should branch on `reason` rather than parsing `log`.

**Markdown output:**

```markdown
# PR #42 [CANCEL] — merged

**status** `MERGED` · **merge** `UNKNOWN` · **state** `MERGED` · **repo** `owner/repo`
**summary** 0 passing

CANCEL: PR #42 is merged — stopping

## Instructions

1. Stop — the active goal is complete.
```

Other heading variants: `# PR #42 [CANCEL] — closed`, `# PR #42 [CANCEL] — ready-delay-elapsed`.

Merged and closed PRs surface terminal top-level statuses (`MERGED` or `CLOSED`) because `runCheck` short-circuits before CI/comment processing. Other body-line variants: `CANCEL: PR #42 is closed — stopping`, `CANCEL: PR #42 has been ready for review — ready-delay elapsed, stopping`.

**What the skill does:** Follow `## Instructions` — stop.

---

## `fix_code`

Actionable work exists — whether it requires code edits or only resolution is up to the agent.

**Trigger:** Any of: unresolved inline review threads, resolution-only inline review threads, actionable PR-level comments, `CHANGES_REQUESTED` reviews, any failing CI check, merge conflicts (`mergeStatus.status === "CONFLICTS"`), or pending review summary IDs to minimize (both first-look and already-seen). Failing checks of all types (timeout, cancelled, startup failure, actionable) route here — the agent runs `gh run view <runId> --log-failed` when it needs job logs, follows the `[conclusion: CANCELLED]` instruction for externally cancelled runs, and follows the `[conclusion: STARTUP_FAILURE]` instruction when jobs/logs may not exist.

**CLI side-effects:** Issues a `POST /repos/{owner}/{repo}/actions/runs/{runId}/cancel` REST call for each unique run ID of failing CI checks (best-effort; already-completed runs return 409 and are silently ignored). **Important:** this cancellation runs on the pre-push run IDs recorded in the sweep — do not re-cancel these IDs after you push, because the push replaces them with fresh runs whose IDs differ.

**Exit code:** 1

**Markdown output:**

```markdown
# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 3 passing
**branch** behind `origin/main`
**required** approvals `1`, conversation-resolution required, checks: `ci/build`, `ci/test`

## Review threads

### `threadId=PRRT_kwDOSGizTs58XB1L` — `src/commands/iterate/index.mts:42` (@alice)

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

1. Decide for each item under `## Review threads` and `## Actionable comments` whether a code change is warranted. **If any code changes are needed:** cancel in-progress runs, apply edits, commit, rebase if the header shows `**branch**` behind/conflicts, push, then run the `resolve:` command. **If no code changes are needed:** skip cancellation/commit/push and run only the `resolve:` command.
2. If you decide to push new commits: cancel each in-progress run listed under `## In-progress runs` before applying code fixes (e.g. `gh run cancel <id>`). Skip this step if you are only resolving threads without pushing — the existing runs remain relevant.
3. Apply code fixes: read and edit each file referenced under `## Review threads` and `## Actionable comments` above.
4. Resolve the threads under `## Review threads to resolve` with the `resolve:` command shown below. These threads are already outdated or minimized, so no code edit is required for them unless their body reveals separate work you choose to do.
5. For each failing check under `## Failing checks`: fetch the log with `gh run view <runId> --log-failed` and decide: rerun with `gh run rerun <runId> --failed` for transient infrastructure failures (network timeout, OOM kill, runner crash), or apply a code fix for real test/build failures; for `[conclusion: CANCELLED]` entries: rerun with `gh run rerun <runId>` if the cancellation looks unintended (not superseded by a newer push or concurrency-group eviction), otherwise treat as resolved — do NOT confuse with IDs under `## Cancelled runs`; for `[conclusion: STARTUP_FAILURE]` entries: inspect with `gh run view <runId>` and rerun with `gh run rerun <runId>` if the workflow should be retried; for `external` entries (no run ID, has URL): open the URL to inspect the failure; for `(no runId)` entries: no log or URL is available — escalate to a human.
6. For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes.
7. If you applied code edits: commit them with a descriptive message, then rebase onto `origin/main` per your repository's conventions before pushing.
8. Run the `resolve:` command shown above, substituting `$HEAD_SHA` with the pushed commit SHA (or `$(git rev-parse HEAD)` if you did not push) and `$DISMISS_MESSAGE` with a one-sentence description of what you changed.
9. Do not re-run `gh run cancel` on the IDs listed under `## Cancelled runs` — the CLI cancelled those runs before your push, and your push has already triggered new runs with different IDs.
10. For any large decisions or rejections you made this iteration, add or update a `## Shepherd Journal` section in the PR description (`gh pr edit 42 --body …`) summarizing each decision. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. If this section already exists, append your entries under it instead of creating a duplicate heading.
11. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.
```

When one or more threads carry a `[suggestion]` marker, the `## Instructions` section inserts a `commit-suggestion` step before "Apply code fixes" and gains a manual-fallback clause on that step:

```markdown
## Instructions

1. Decide for each item under `## Review threads` and `## Actionable comments` whether a code change is warranted. …
2. If you decide to push new commits: cancel each in-progress run …
3. For each thread marked `[suggestion]` under `## Review threads`: run `npx pr-shepherd commit-suggestion 42 --thread-id <id> --message "<one-sentence headline>" --format=json` to retrieve the patch and suggested commit. The CLI does not mutate the working tree — apply the patch yourself, then stage the listed file and run the suggested `git commit`. Include the thread ID in `--resolve-thread-ids` in the resolve command below. If the patch fails to apply, fall through to the manual-edit step. Do not retry the same command.
4. Apply code fixes: read and edit each file referenced under `## Review threads` and `## Actionable comments` above. When applying a `[suggestion]` thread manually (e.g. when a patch fails to apply), replace the exact line range shown in the heading (`path:startLine-endLine`) with the replacement shown in its `Replaces lines …` block verbatim.
5. [remaining steps — resolution-only, failing checks, reviews, commit/rebase, resolve, cancelled-runs guard, journal, stop — renumber starting here]
```

The `commit-suggestion` step is absent when no thread has a `[suggestion]` marker; the manual-fallback clause on "Apply code fixes" is absent in the same case.

**Section order:**

1. Heading + base fields (always present).
2. `## Review threads` — each thread under ``### `threadId=<id>` — <loc> (@author) [suggestion]?`` (or `### [threadId=<id>](<url>) — <loc> (@author) [suggestion]?` when a URL is available) where `<loc>` is `` `path:line` `` for single-line threads or `` `path:startLine-endLine` `` for multi-line threads. The full body follows as a `>` blockquote. Multi-paragraph bodies preserve empty lines as `>` lines. Threads with a ` ```suggestion ` fence carry a `[suggestion]` tag in the heading and a `Replaces lines …` block after the body showing the parsed replacement.
3. `## Review threads to resolve` — unresolved outdated/minimized inline threads that should be passed to `--resolve-thread-ids` but do not require code edits unless the agent chooses to act on the body.
4. `## Actionable comments` — same H3-plus-blockquote shape as threads minus the `<loc>`: ``### `commentId=<id>` `` or `### [commentId=<id>](<url>)` when a URL is available.
5. `## Failing checks` — one bullet per failing check. Shape varies by locator:
   - ``- `<runId>` — `<workflowName> › <jobName>` `` for GitHub Actions checks (`workflowName ›` prefix omitted when unavailable; `jobName` falls back to the check name when absent).
   - ``- external `<detailsUrl>` — `<name>` `` for external status checks (codecov, vercel, etc.) with null `runId` but a URL.
   - ``- (no runId) — `<name>` `` when both are null.

   Every bullet carries a `[conclusion: <CONCLUSION>]` tag (e.g. `[conclusion: FAILURE]`, `[conclusion: TIMED_OUT]`, `[conclusion: CANCELLED]`, `[conclusion: STARTUP_FAILURE]`); null conclusions produce no tag. Non-CANCELLED bullets may also carry a `> <failedStep>` blockquote line (the first step that failed, GitHub Actions only) and a `> <summary>` blockquote line (one-line status text from the GitHub UI), both omitted when not available.

   The numbered instructions emit a single collapsed step covering all failing-check categories present, using semicolon-separated clauses: runId checks → fetch log + rerun or fix; CANCELLED → rerun if unintended, else treat as resolved; STARTUP_FAILURE → inspect metadata + rerun; external (URL, no runId) → open the URL; bare (no runId, no URL) → escalate to a human. The step is omitted when `checks` is empty.

6. `## Changes-requested reviews` — one bullet per `CHANGES_REQUESTED` review: ``- `reviewId=<id>` (@<author>[ · <authorType>])``.
7. `## Review summaries (first look)` — `COMMENTED` review summaries the agent has **not yet seen**. Each entry is rendered with an H3 heading (``### `reviewId=<id>` (@<author>[ · <authorType>])``) and the full body as a `>` blockquote. IDs eligible under `iterate.minimizeComments` are included in `--minimize-comment-ids`; ineligible IDs are surfaced once, marked seen, and not minimized. Not emitted when empty.
8. `## Review summaries (edited since first look — already minimized; do not re-minimize)` — `COMMENTED` review summaries whose body was edited by the author after Shepherd last surfaced them. Each entry is rendered the same way as section 7 (H3 heading + `>` blockquote). These IDs are **NOT** included in `--minimize-comment-ids` — the review is already minimized on GitHub (or was in a prior iteration's minimize queue). Read the updated body and record any Shepherd Journal note, but do not pass these IDs to any mutation flag. The seen-marker hash is updated after display so the next run only re-surfaces them if the body changes again. Not emitted when empty.
9. `## Review IDs to minimize queue` — backticked review IDs (`PRR_…`) of `COMMENTED` review summaries whose bodies were surfaced in a **prior** iteration, whose body has not changed since, and whose GitHub `authorType` matches `iterate.minimizeComments`. If `iterate.minimizeApprovals` is `true`, this section may also include matching `APPROVED` review IDs queued for minimization even though their bodies were not previously surfaced. All IDs from sections 7 and 9 that pass the policy are merged into `--minimize-comment-ids` in the resolve command. Not emitted when empty.
10. `## Approvals (surfaced — not minimized)` — emitted when `iterate.minimizeApprovals` is `false` (default) and there are `APPROVED`-state reviews. H3 heading uses `` `reviewId=<id>` `` (same prefix scheme as other item types); body is a `>` blockquote or `(no review body)` when empty. Surfaced for visibility, but NOT included in `--minimize-comment-ids`.
11. `## First-look items (N) — acknowledge status before acting` — threads and PR comments that are outdated, resolved, or minimized and have not yet been acknowledged by the agent. Emitted on first encounter only; a per-item seen-marker file (`src/state/seen-comments.mts`) suppresses them on subsequent runs. Each bullet carries a `[status: …]` tag: `outdated`, `outdated, auto-resolved`, `resolved`, or `minimized`. If the body was edited since the item was first acknowledged, the tag gains an `, edited` suffix (e.g. `[status: minimized, edited]`). If a first-look thread also appears under `## Review threads to resolve`, its ID is already included in the resolve command; otherwise do not pass first-look-only IDs to mutation flags. Not emitted when empty.
12. `## In-progress runs` — backticked GitHub Actions run IDs of in-progress checks that the agent should cancel before pushing. Emitted whenever at least one in-progress check has a non-null run ID that the CLI did not already cancel. The agent decides whether to cancel (step 2 of `## Instructions`): cancel before pushing code fixes; skip if only resolving threads without pushing. Distinct from `## Cancelled runs`: those IDs were already cancelled by the CLI before the agent acts; these IDs the agent must cancel itself if it decides to push. Not emitted when empty.
13. `## Cancelled runs` — backticked IDs, emitted only when at least one pre-push REST cancellation succeeded.
14. `## Post-fix push`:
    - ``- base: `<branch>` `` — rebase target for the push step.
    - ``- resolve: `<argv>` `` — fully-quoted resolve command. `$DISMISS_MESSAGE` and `$HEAD_SHA` are always quoted so substituting a multi-word sentence keeps it as one argument. `--require-sha "$HEAD_SHA"` is appended when the underlying resolve command can mutate state against a moving HEAD — specifically, when `--resolve-thread-ids` contains actionable thread IDs (threads from `## Review threads` that required code edits), when failing checks are being addressed, or when `--dismiss-review-ids` is present. `--resolve-thread-ids` populated only with resolution-only thread IDs (threads from `## Review threads to resolve` that needed no code edits) does not trigger `--require-sha`.
15. `## Instructions` — numbered list to execute in order. The final instruction always refers back to the `resolve:` bullet rather than duplicating the command — that single source of truth is what the skill executes.

The JSON payload exposes the same data under `fix.{threads, resolutionOnlyThreads, actionableComments, reviewSummaryIds, firstLookSummaries, editedSummaries, surfacedApprovals, checks, changesRequestedReviews, resolveCommand, instructions, firstLookThreads, firstLookComments, inProgressRunIds}` plus top-level `baseBranch`, `branchProtection` (on `IterateResultBase`, not under `fix`), and `cancelled`. Comment/review/thread objects include `authorType` when GitHub returned an author classification (`User`, `Bot`, or `Unknown`). `fix.inProgressRunIds` contains the GitHub Actions run IDs the agent should cancel before pushing (mirrors `## In-progress runs` in the Markdown output); populated whenever at least one in-progress check has a non-null run ID not already cancelled by the CLI — the agent decides whether to cancel based on whether it is pushing. External status checks and already-cancelled runs are excluded. In lean JSON mode this field is omitted when empty. `branchProtection` is `null` when no branch protection rule applies; otherwise it is `{ requiresApprovingReviews, requiredApprovingReviewCount, requiresConversationResolution, requiredStatusCheckContexts }` — the raw values from GitHub's `branchProtectionRule`. `resolutionOnlyThreads` contains unresolved outdated/minimized review threads routed to `--resolve-thread-ids` without causing a push or `--require-sha`. `reviewSummaryIds` contains the review IDs routed to `--minimize-comment-ids`: COMMENTED summaries that pass `iterate.minimizeComments`, and APPROVED reviews only when approval minimization is enabled and they also pass the author policy. `droppedDismissReviewIds` is included only when `resolveCommand` had to remove `changesRequestedReviews` that overlapped `--minimize-comment-ids` so they are not retried as dismiss attempts. `firstLookSummaries` carries the full `Review` objects for bodies seen this iteration for the first time. `editedSummaries` carries the full `Review` objects for summaries whose body changed since last seen — these IDs are **not** in `reviewSummaryIds`. `resolveCommand.argv` starts with the configured runner argv (`["npx", "pr-shepherd", …]`, `["pnpm", "exec", "pr-shepherd", …]`, `["yarn", "run", "pr-shepherd", …]`, or `["bunx", "pr-shepherd", …]`). In lean JSON mode, `fix.*` arrays that are empty are omitted; `cancelled` is omitted when empty. Pass `--verbose` to include all fields. `firstLookThreads` and `firstLookComments` are informational unless the same thread appears in `resolutionOnlyThreads`.

**Resolve command rules (same in Markdown and JSON):**

- `--require-sha "$HEAD_SHA"` is appended when a mutation may become stale on a moving HEAD: specifically, when `--resolve-thread-ids` contains actionable thread IDs (threads from `## Review threads` that required code edits), when failing checks are being addressed, or when `--dismiss-review-ids` is present. `--resolve-thread-ids` populated only with resolution-only thread IDs (threads from `## Review threads to resolve` that needed no code edits) does not trigger `--require-sha`. Comment-only and summary-only dispatches omit it.
- `$DISMISS_MESSAGE` must be one specific sentence describing what changed — never generic text like "address review comments".

### Applying ` ```suggestion ` blocks

GitHub reviewers can leave ` ```suggestion ` fenced blocks in review thread bodies. The CLI parses these and surfaces them in two additions to each thread:

- A `[suggestion]` marker on the heading.
- A `Replaces line(s) …` block immediately after the blockquoted body, showing the parsed replacement. An empty suggestion (deletion) uses the label `Replaces line(s) … with nothing:` followed by an empty fenced block.

When at least one thread has a `[suggestion]` marker, the agent sees these two instruction steps. The CLI substitutes the real PR number; `<id>` and `<one-sentence headline>` are left for the agent to fill in.

**Step 1 — structured path (preferred):**

> For each thread marked `` `[suggestion]` `` under `` `## Review threads` ``: run `` `npx pr-shepherd commit-suggestion 42 --thread-id <id> --message "<one-sentence headline>" --format=json` `` to retrieve the patch and suggested commit. The CLI does not mutate the working tree — apply the patch yourself (run `git apply` with the diff shown, or edit the file directly using the line range), then stage the listed file and run the suggested `git commit` from the `## Instructions` section. Include the thread ID in `--resolve-thread-ids` in the resolve command below (the thread is not auto-resolved). If the patch fails to apply, fall through to the manual-edit step. Do not retry the same command.

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

**What the skill does:** Follow `## Instructions` in order. The instructions are self-contained and action-specific — no dispatch table needed. See `## Instructions` in the output for the exact steps. This output is designed for a single re-entry tick; do not run `while true` or unbounded polling loops outside of `pr-shepherd poll`.

---

## `escalate`

Ambiguous state that requires human judgement — iteration stops and surfaces details.

**Trigger:** Any of:

- **`stall-timeout`** — the iterate result has not materially changed for `config.iterate.stallTimeoutMinutes` minutes (default 30). Catches loops where the same failing test, transient error, or pending state repeats indefinitely without progress. The timer resets whenever the HEAD SHA, failing-check set, or actionable item IDs change. Override with `--stall-timeout <duration>` (e.g. `--stall-timeout 1h`).
- **`fix-thrash`** — same thread dispatched ≥ `config.iterate.fixAttemptsPerThread` times (default 3) without resolving. This is a manual handoff: automated fixes pause.
- **`pr-level-changes-requested`** — reviewer requested changes but left no inline threads, comments, or CI failures to act on (not triggered when merge conflicts are present).
- **`thread-missing-location`** — an actionable review thread has no file or line reference, so the code location cannot be found automatically.
- **`base-branch-unknown`** — the GraphQL batch did not yield a usable base branch name: the derived value was empty or contained unsafe characters. Preempts any `[FIX_CODE]` that would require a push, since rebasing onto the wrong base is worse than pausing iteration.

**CLI side-effects:** None.

**Exit code:** 3

**Markdown output:**

```markdown
# PR #42 [ESCALATE]

**status** `UNRESOLVED_COMMENTS` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `fix-thrash`

Same thread(s) reached the automated attempt limit — treat this as a manual handoff. Apply the fix by hand.

## Items needing attention

- thread `PRRT_kwDOSGizTs58XB1L` — `src/commands/iterate/index.mts:42` (@alice): The variable name is misleading

## Fix attempts

- thread `PRRT_kwDOSGizTs58XB1L` attempted 3 times

---

After completing manual fixes (and pushing if required), rerun `/pr-shepherd:pr-shepherd 42` to resume.

## Instructions

1. Stop — the PR needs human direction before iterating can resume. This is a manual handoff; do not continue automated fix attempts.
```

The block after the base-fields line (separated by a blank line) is `escalate.humanMessage` in JSON — ready to print verbatim.

**What the skill does:** Follow `## Instructions` — stop.

---

## Archived / no longer emitted

### `rerun_ci`

> **This action is no longer emitted by `iterate`.** Transient CI failure detection (timeout / cancelled) has been moved to the agent: the `fix_code` action now carries `failedStep`/`conclusion` for every failing check, and the `## Instructions` section tells the agent to run `gh run view <runId> --log-failed` and decide whether to rerun or apply a code fix. Current releases no longer include a `rerun_ci` action or `[RERUN_CI]` formatter output.

**Trigger:** Previously emitted when one or more failing checks had `failureKind === "timeout"` or `"cancelled"` and no actionable work was found. Removed in favour of routing all failing checks through `fix_code` with raw log data.
