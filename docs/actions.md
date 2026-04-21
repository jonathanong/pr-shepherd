# shepherd actions

[← README.md](README.md)

Each iteration of `shepherd iterate` returns exactly one action. See [docs/iterate-flow.md](iterate-flow.md) for the decision order.

The default output format is Markdown — what you see when running `npx pr-shepherd iterate <PR>`, and what the monitor SKILL reads each cron tick. `--format=json` emits the same information as a single JSON object for scripting. Every example below shows what the agent actually sees.

**Output shape (every action):**

```
# PR #<N> [ACTION]

**status** `<…>` · **merge** `<…>` · **state** `<…>` · **repo** `<…>`
**summary** <N> passing, <N> skipped, <N> filtered, <N> inProgress · **remainingSeconds** <N> · **copilotReviewInProgress** <bool> · **isDraft** <bool> · **shouldCancel** <bool>

<action-specific body>
```

Load-bearing conventions (the monitor SKILL depends on these):

1. Line 1 is always an H1 heading of the form `# PR #<N> [<ACTION>]`. The monitor greps the `[ACTION]` tag.
2. Lines 3–4 carry the full base fields (status, merge, state, repo, summary, remainingSeconds, etc.), so Markdown output is never a lossy view of JSON.
3. Under `[REBASE]`, the shell script is inside a ```bash fenced block — the monitor extracts it for execution.
4. Under `[FIX_CODE]`, the `## Rebase` section has a `` resolve: `<command>` `` bullet — the monitor strips backticks and runs the command.
5. Under `[FIX_CODE]`, `## Instructions` items are numbered `1.`, `2.`, … and executed in order.

---

## `cooldown`

Skips all work because the last commit is too fresh for CI checks to have started.

**Trigger:** `nowSeconds − lastCommitTime < cooldownSeconds` (default 30s). No sweep is run.

**CLI side-effects:** None.

**Exit code:** 0

**Markdown output:**

```markdown
# PR #42 [COOLDOWN]

**status** `UNKNOWN` · **merge** `UNKNOWN` · **state** `UNKNOWN` · **repo** ``
**summary** 0 passing, 0 skipped, 0 filtered, 0 inProgress · **remainingSeconds** 600 · **copilotReviewInProgress** false · **isDraft** false · **shouldCancel** false

SKIP: CI still starting — waiting for first check to appear
```

`status`, `merge`, `state` are `UNKNOWN` and `repo` is empty because the early return happens before any GitHub sweep.

**What the monitor does:** Print the output and wait for the next cron fire.

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
**summary** 3 passing, 0 skipped, 0 filtered, 2 inProgress · **remainingSeconds** 120 · **copilotReviewInProgress** false · **isDraft** false · **shouldCancel** false

WAIT: 3 passing, 2 in-progress — 120s until auto-cancel
```

The body line (`WAIT: …`) varies with the merge state — `branch is behind base`, `blocked by pending reviews or required status checks`, `PR is a draft`, or `some checks are unstable`.

**What the monitor does:** Print the output and wait for the next cron fire.

---

## `rerun_ci`

Re-triggers CI runs that failed due to transient infrastructure or timeout issues.

**Trigger:** One or more failing checks have `failureKind === "timeout"` or `"infrastructure"`, and no actionable work was found (evaluated after step 4).

**CLI side-effects:** Calls `gh run rerun <runId> --failed` for each unique run ID. Deduplicates — multiple failed steps sharing a run ID produce one rerun call.

**Exit code:** 0

**Markdown output:**

```markdown
# PR #42 [RERUN_CI]

**status** `FAILING` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing, 0 skipped, 0 filtered, 0 inProgress · **remainingSeconds** 600 · **copilotReviewInProgress** false · **isDraft** false · **shouldCancel** false

RERAN 2 CI runs: 24697658766 (lint / typecheck / test (22.x) — timeout), 24697658767 (build — infrastructure)
```

Each comma-separated entry on the body line has shape `<runId> (<check names joined by ", "> — <failureKind>)`. JSON surfaces the same information as `reran: ReranRun[]`.

**What the monitor does:** Print the output and wait for CI to re-queue.

---

## `mark_ready`

Converts a draft PR to ready for review.

**Trigger:** All of: `status === "READY"`, `mergeStateStatus === "CLEAN"` (or `"DRAFT"` when `isDraft`), Copilot review not in progress, `isDraft === true`, ready-delay elapsed.

**CLI side-effects:** Calls `gh pr ready <PR>` before returning.

**Exit code:** 0

**Markdown output:**

```markdown
# PR #42 [MARK_READY]

**status** `READY` · **merge** `DRAFT` · **state** `OPEN` · **repo** `owner/repo`
**summary** 5 passing, 0 skipped, 0 filtered, 0 inProgress · **remainingSeconds** 600 · **copilotReviewInProgress** false · **isDraft** true · **shouldCancel** false

MARKED READY: PR #42 converted from draft to ready for review
```

**What the monitor does:** Print the output and continue monitoring.

---

## `cancel`

Stops the monitor loop — no further iterations needed.

**Trigger:** Either the PR is merged or closed (`state !== "OPEN"`), or the ready-delay timer elapsed (`readyState.shouldCancel`).

**CLI side-effects:** None. The `ready-since.txt` file is left in place.

**Exit code:** 2

**Markdown output:**

```markdown
# PR #42 [CANCEL]

**status** `READY` · **merge** `CLEAN` · **state** `MERGED` · **repo** `owner/repo`
**summary** 5 passing, 0 skipped, 0 filtered, 0 inProgress · **remainingSeconds** 0 · **copilotReviewInProgress** false · **isDraft** false · **shouldCancel** true

CANCEL: PR #42 is merged — stopping monitor
```

Other body-line variants: `CANCEL: PR #42 is closed — stopping monitor`, `CANCEL: PR #42 has been ready for review — ready-delay elapsed, stopping monitor`.

**What the monitor does:** Print the output, then invoke `/loop cancel` via Skill tool to stop the cron job.

---

## `rebase`

Rebases the branch on top of its base to clear flaky failures caused by being behind.

**Trigger:** A failing check has `failureKind === "flaky"` AND `mergeStatus.status === "BEHIND"` AND `config.actions.autoRebase` is enabled.

> Note: merge conflicts (`CONFLICTS`) are handled by `fix_code`, not `rebase`.

**CLI side-effects:** None. The CLI fetches the base branch name via `gh pr view` and pre-builds the shell script.

**Exit code:** 1

**Markdown output:**

````markdown
# PR #42 [REBASE]

**status** `FAILING` · **merge** `BEHIND` · **state** `OPEN` · **repo** `owner/repo`
**summary** 2 passing, 0 skipped, 0 filtered, 0 inProgress · **remainingSeconds** 600 · **copilotReviewInProgress** false · **isDraft** false · **shouldCancel** false

Branch is behind main — rebasing to pick up latest changes and clear flaky failures

```bash
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "SKIP rebase: dirty worktree (uncommitted changes present)"
  exit 1
fi
git fetch origin && git rebase origin/main && git push --force-with-lease
```
````

The dirty-worktree guard exits 1 on skip, so the monitor SKILL sees a non-zero exit rather than silently counting the iteration as successful.

**Base branch determination:** The CLI runs `gh pr view <PR> --json baseRefName` to find the rebase target. If that command fails (network error, auth issue) or returns a branch name containing characters outside `[A-Za-z0-9._/-]`, the CLI emits `[ESCALATE]` with trigger `base-branch-unknown` instead of a rebase — force-pushing onto the wrong base would be catastrophic for a PR that actually targets e.g. `release/2026.04`.

**What the monitor does:** Print the heading + base fields + reason, then extract the shell script from the ```bash fenced block and run it in Bash.

---

## `fix_code`

Actionable work needs a code fix, commit, and push.

**Trigger:** Any of: unresolved inline review threads, actionable PR-level comments, `CHANGES_REQUESTED` reviews, actionable CI failures (`failureKind === "actionable"`), or merge conflicts (`mergeStatus.status === "CONFLICTS"`). Evaluated at step 4, before rerun/rebase.

**CLI side-effects:** Calls `gh run cancel <runId>` for each unique run ID of actionable CI failures (best-effort; already-completed runs are silently ignored). **Important:** this cancellation runs on the pre-push run IDs recorded in the sweep — do not re-run `gh run cancel` on these IDs after you push, because the push replaces them with fresh runs whose IDs differ.

**Exit code:** 1

**Markdown output:**

```markdown
# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 3 passing, 0 skipped, 0 filtered, 0 inProgress · **remainingSeconds** 600 · **copilotReviewInProgress** false · **isDraft** false · **shouldCancel** false

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

- `24697658766` — `lint / typecheck / test (22.x)` (actionable)

## Changes-requested reviews

- `PRR_kwDOSGizTs58XB1R` (@alice)

## Noise (minimize only)

`IC_kwDOSGizTs7_ajT9`

## Cancelled runs

`24697658765`

## Rebase

- base: `main`
- resolve: `npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_kwDOSGizTs58XB1L --minimize-comment-ids IC_kwDOSGizTs7_ajT8,IC_kwDOSGizTs7_ajT9 --dismiss-review-ids PRR_kwDOSGizTs58XB1R --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Apply code fixes: read and edit each file referenced under `## Review threads` and `## Actionable comments` above.
2. For each bullet in `## Failing checks` whose backticked locator is a numeric runId (GitHub Actions): run `gh run view <runId> --log-failed`, identify the failure, and apply the fix.
3. For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes.
4. Commit changed files: `git add <files> && git commit -m "<descriptive message>"`
5. Rebase and push: `git fetch origin && git rebase origin/main && git push --force-with-lease` — capture `HEAD_SHA=$(git rev-parse HEAD)`
6. Run the `resolve:` command shown above, substituting "$HEAD_SHA" with the pushed commit SHA and $DISMISS_MESSAGE with a one-sentence description of what you changed.
```

**Section order:**

1. Heading + base fields (always present).
2. `## Review threads` — each thread under `### <id> — <loc> (@author)` with the full body as a `>` blockquote. Multi-paragraph bodies preserve empty lines as `>` lines, so code blocks and ` ```suggestion ` blocks survive intact.
3. `## Actionable comments` — same shape as threads minus the `<loc>`.
4. `## Failing checks` — one bullet per actionable failing check. Shape varies by locator:
   - ``- `<runId>` — `<name>` (<failureKind|actionable>)`` for GitHub Actions checks.
   - ``- external `<detailsUrl>` — `<name>` (<failureKind|actionable>)`` for external status checks (codecov, vercel, etc.) with null `runId` but a URL.
   - ``- (no runId) — `<name>` (<failureKind|actionable>)`` when both are null.

   The numbered instructions split accordingly: `gh run view <runId> --log-failed` for GitHub Actions, open `detailsUrl` manually for external checks.

5. `## Changes-requested reviews` — one bullet per `CHANGES_REQUESTED` review: ``- `<reviewId>` (@<author>)``.
6. `## Noise (minimize only)` — backticked IDs of bot-noise comments (quota warnings, rate-limit acks). Minimize on GitHub but do not act on them.
7. `## Cancelled runs` — backticked IDs, emitted only when CLI-side `gh run cancel` succeeded for at least one run.
8. `## Rebase`:
   - ``- base: `<branch>` `` — rebase target for the push step.
   - ``- resolve: `<argv>` `` — fully-quoted resolve command. `$DISMISS_MESSAGE` and `$HEAD_SHA` are always quoted so substituting a multi-word sentence keeps it as one argument. `--require-sha "$HEAD_SHA"` is appended only when a push is expected (threads/actionableComments/checks/reviews present); noise-only dispatches omit it.
9. `## Instructions` — numbered list to execute in order. The final instruction always refers back to the `resolve:` bullet rather than duplicating the command — that single source of truth is what the monitor executes.

The JSON payload exposes the same data under `fix.{threads, actionableComments, noiseCommentIds, checks, changesRequestedReviews, baseBranch, resolveCommand, instructions}` plus top-level `cancelled`.

**Resolve command rules (same in Markdown and JSON):**

- `--require-sha "$HEAD_SHA"` is appended only when a push occurred. Noise-only minimizations omit it.
- `$DISMISS_MESSAGE` must be one specific sentence describing what changed — never generic text like "address review comments".

**What the monitor does:** Follow the numbered instructions in order, run the backticked `resolve:` command as the final step, then stop this iteration to let CI run. Never re-run `gh run cancel` on the `## Cancelled runs` IDs after your push.

---

## `escalate`

Ambiguous state that requires human judgement — the monitor stops and surfaces details.

**Trigger:** Any of:

- **`fix-thrash`** — same thread dispatched ≥ `config.iterate.fixAttemptsPerThread` times (default 3) without resolving.
- **`pr-level-changes-requested`** — reviewer requested changes but left no inline threads, comments, or CI failures to act on (not triggered when merge conflicts are present).
- **`thread-missing-location`** — an actionable review thread has no file or line reference, so the code location cannot be found automatically.
- **`base-branch-unknown`** — `gh pr view --json baseRefName` failed (network/auth error) or returned a ref name with unsafe characters. Preempts both `[REBASE]` and any `[FIX_CODE]` that would require a push, since rebasing onto the wrong base is worse than pausing the monitor.

**CLI side-effects:** None.

**Exit code:** 3

**Markdown output:**

```markdown
# PR #42 [ESCALATE]

**status** `UNRESOLVED_COMMENTS` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing, 0 skipped, 0 filtered, 0 inProgress · **remainingSeconds** 600 · **copilotReviewInProgress** false · **isDraft** false · **shouldCancel** false

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
```

The block after the base-fields line (separated by a blank line) is `escalate.humanMessage` in JSON — ready to print verbatim.

**What the monitor does:** Print the full output, then invoke `/loop cancel` via Skill tool to stop the cron job.
