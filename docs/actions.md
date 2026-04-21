# shepherd actions

[← README.md](README.md)

Each iteration of `shepherd iterate` returns exactly one action. See [docs/iterate-flow.md](iterate-flow.md) for the decision order.

The default output format is text — what you see when running `npx pr-shepherd iterate <PR>`, and what the monitor SKILL reads each cron tick. `--format=json` emits the same information as a single JSON object for scripting. Every example below shows what the agent actually sees.

**Output shape (every action):**

```
PR #<N> [ACTION] status=<…> merge=<…> state=<…>[ — <short action-specific summary>]
info: repo=<…> passing=<N> skipped=<N> filtered=<N> inProgress=<N> remainingSeconds=<N> copilotReviewInProgress=<bool> isDraft=<bool> shouldCancel=<bool>

<optional additional body, separated by a blank line>
```

The first token after `PR #<N>` is always the `[ACTION]` tag — the monitor SKILL reads this to decide what to do. Line 2 is always the `info:` line with the remaining base fields, so text output is never a lossy view of JSON. Simple actions (`cooldown`, `wait`, `rerun_ci`, `mark_ready`, `cancel`) are two lines. Rich actions (`rebase`, `fix_code`, `escalate`) follow with a blank line and an action-specific body.

---

## `cooldown`

Skips all work because the last commit is too fresh for CI checks to have started.

**Trigger:** `nowSeconds − lastCommitTime < cooldownSeconds` (default 30s). No sweep is run.

**CLI side-effects:** None.

**Exit code:** 0

**Text output:**

```
PR #42 [COOLDOWN] status=UNKNOWN merge=UNKNOWN state=UNKNOWN — SKIP: CI still starting — waiting for first check to appear
info: repo= passing=0 skipped=0 filtered=0 inProgress=0 remainingSeconds=600 copilotReviewInProgress=false isDraft=false shouldCancel=false
```

`status`, `merge`, `state` are `UNKNOWN` and `repo=` is blank because the early return happens before any GitHub sweep.

**What the monitor does:** Print the output and wait for the next cron fire.

---

## `wait`

Nothing actionable to do; all CI is passing or in-progress.

**Trigger:** Fallthrough — no actionable work, no terminal state, not ready to mark, no ready-delay elapsed.

**CLI side-effects:** None.

**Exit code:** 0

**Text output examples:**

```
PR #42 [WAIT] status=IN_PROGRESS merge=BLOCKED state=OPEN — WAIT: 3 passing, 2 in-progress — 120s until auto-cancel
info: repo=owner/repo passing=3 skipped=0 filtered=0 inProgress=2 remainingSeconds=120 copilotReviewInProgress=false isDraft=false shouldCancel=false
```

```
PR #42 [WAIT] status=IN_PROGRESS merge=BEHIND state=OPEN — WAIT: 2 passing, 0 in-progress — branch is behind base — 300s until auto-cancel
info: repo=owner/repo passing=2 skipped=0 filtered=0 inProgress=0 remainingSeconds=300 copilotReviewInProgress=false isDraft=false shouldCancel=false
```

```
PR #42 [WAIT] status=BLOCKED merge=BLOCKED state=OPEN — WAIT: 4 passing, 0 in-progress — blocked by pending reviews or required status checks
info: repo=owner/repo passing=4 skipped=0 filtered=0 inProgress=0 remainingSeconds=0 copilotReviewInProgress=false isDraft=false shouldCancel=false
```

**What the monitor does:** Print the output and wait for the next cron fire.

---

## `rerun_ci`

Re-triggers CI runs that failed due to transient infrastructure or timeout issues.

**Trigger:** One or more failing checks have `failureKind === "timeout"` or `"infrastructure"`, and no actionable work was found (evaluated after step 4).

**CLI side-effects:** Calls `gh run rerun <runId> --failed` for each unique run ID. Deduplicates — multiple failed steps sharing a run ID produce one rerun call.

**Exit code:** 0

**Text output:**

```
PR #42 [RERUN_CI] status=FAILING merge=BLOCKED state=OPEN — RERAN 2 CI runs: 24697658766 (lint / typecheck / test (22.x) — timeout), 24697658767 (build — infrastructure)
info: repo=owner/repo passing=0 skipped=0 filtered=0 inProgress=0 remainingSeconds=600 copilotReviewInProgress=false isDraft=false shouldCancel=false
```

Each comma-separated entry on the headline has shape `<runId> (<check names joined by ", "> — <failureKind>)`. JSON surfaces the same information as `reran: ReranRun[]`.

**What the monitor does:** Print the output and wait for CI to re-queue.

---

## `mark_ready`

Converts a draft PR to ready for review.

**Trigger:** All of: `status === "READY"`, `mergeStateStatus === "CLEAN"` (or `"DRAFT"` when `isDraft`), Copilot review not in progress, `isDraft === true`, ready-delay not elapsed.

**CLI side-effects:** Calls `gh pr ready <PR>` before returning.

**Exit code:** 0

**Text output:**

```
PR #42 [MARK_READY] status=READY merge=DRAFT state=OPEN — MARKED READY: PR #42 converted from draft to ready for review
info: repo=owner/repo passing=5 skipped=0 filtered=0 inProgress=0 remainingSeconds=600 copilotReviewInProgress=false isDraft=true shouldCancel=false
```

**What the monitor does:** Print the output and continue monitoring.

---

## `cancel`

Stops the monitor loop — no further iterations needed.

**Trigger:** Either the PR is merged or closed (`state !== "OPEN"`), or the ready-delay timer elapsed (`readyState.shouldCancel`).

**CLI side-effects:** None. The `ready-since.txt` file is left in place.

**Exit code:** 2

**Text output examples:**

```
PR #42 [CANCEL] status=READY merge=CLEAN state=MERGED — CANCEL: PR #42 is merged — stopping monitor
info: repo=owner/repo passing=5 skipped=0 filtered=0 inProgress=0 remainingSeconds=0 copilotReviewInProgress=false isDraft=false shouldCancel=true
```

```
PR #42 [CANCEL] status=READY merge=CLEAN state=CLOSED — CANCEL: PR #42 is closed — stopping monitor
info: repo=owner/repo passing=5 skipped=0 filtered=0 inProgress=0 remainingSeconds=0 copilotReviewInProgress=false isDraft=false shouldCancel=true
```

```
PR #42 [CANCEL] status=READY merge=CLEAN state=OPEN — CANCEL: PR #42 has been ready for review — ready-delay elapsed, stopping monitor
info: repo=owner/repo passing=5 skipped=0 filtered=0 inProgress=0 remainingSeconds=0 copilotReviewInProgress=false isDraft=false shouldCancel=true
```

**What the monitor does:** Print the output, then invoke `/loop cancel` via Skill tool to stop the cron job.

---

## `rebase`

Rebases the branch on top of its base to clear flaky failures caused by being behind.

**Trigger:** A failing check has `failureKind === "flaky"` AND `mergeStatus.status === "BEHIND"` AND `config.actions.autoRebase` is enabled.

> Note: merge conflicts (`CONFLICTS`) are handled by `fix_code`, not `rebase`.

**CLI side-effects:** None. The CLI fetches the base branch name via `gh pr view` and pre-builds the shell script.

**Exit code:** 1

**Text output:**

```
PR #42 [REBASE] status=FAILING merge=BEHIND state=OPEN — Branch is behind main — rebasing to pick up latest changes and clear flaky failures
info: repo=owner/repo passing=2 skipped=0 filtered=0 inProgress=0 remainingSeconds=600 copilotReviewInProgress=false isDraft=false shouldCancel=false

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "SKIP rebase: dirty worktree (uncommitted changes present)"
  exit 1
fi
git fetch origin && git rebase origin/main && git push --force-with-lease
```

The dirty-worktree guard exits 1 on skip, so the monitor SKILL sees a non-zero exit rather than silently counting the iteration as successful.

**What the monitor does:** Print the headline + `info:` line, then run the shell script lines (everything after the blank line) in Bash.

---

## `fix_code`

Actionable work needs a code fix, commit, and push.

**Trigger:** Any of: unresolved inline review threads, actionable PR-level comments, `CHANGES_REQUESTED` reviews, actionable CI failures (`failureKind === "actionable"`), or merge conflicts (`mergeStatus.status === "CONFLICTS"`). Evaluated at step 4, before rerun/rebase.

**CLI side-effects:** Calls `gh run cancel <runId>` for each unique run ID of actionable CI failures (best-effort; already-completed runs are silently ignored).

**Exit code:** 1

**Text output:**

```
PR #42 [FIX_CODE] status=UNRESOLVED_COMMENTS merge=BLOCKED state=OPEN
info: repo=owner/repo passing=3 skipped=0 filtered=0 inProgress=0 remainingSeconds=600 copilotReviewInProgress=false isDraft=false shouldCancel=false

  thread PRRT_kwDOSGizTs58XB1L src/commands/iterate.mts:42 (@alice):
    The variable name is misleading.

    Consider renaming `x` to `remainingSeconds` so readers don't have to
    trace back to the declaration to understand its meaning.
  comment IC_kwDOSGizTs7_ajT8 (@bob):
    Consider using a more descriptive name here.
  check 24697658766 — lint / typecheck / test (22.x) (actionable)
  review PRR_kwDOSGizTs58XB1R (@alice): changes requested
  noise (minimize only): IC_kwDOSGizTs7_ajT9
  cancelled runs: 24697658765

  base: main
  resolve: npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_kwDOSGizTs58XB1L --minimize-comment-ids IC_kwDOSGizTs7_ajT8,IC_kwDOSGizTs7_ajT9 --dismiss-review-ids PRR_kwDOSGizTs58XB1R --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"

  1. Apply code fixes: read and edit each file referenced in fix.threads and fix.actionableComments.
  2. For each fix.checks[].runId: run gh run view <runId> --log-failed, identify the failure, and apply the fix.
  3. For each fix.changesRequestedReviews: read the review body and apply the requested changes.
  4. Commit changed files: git add <files> && git commit -m "<descriptive message>"
  5. Rebase and push: git fetch origin && git rebase origin/main && git push --force-with-lease — capture HEAD_SHA=$(git rev-parse HEAD)
  6. Run the `resolve:` command shown above, substituting "$HEAD_SHA" with the pushed commit SHA and $DISMISS_MESSAGE with a one-sentence description of what you changed.
```

Layout (in order), with blank lines separating the section groups:

1. Headline `PR #<N> [FIX_CODE] status=… merge=… state=…`.
2. `info:` line with the remaining base fields.
3. **Items** (if any): threads, actionable comments, checks, reviews, noise, cancelled runs.
4. **Rebase target + resolve command**.
5. **Numbered instructions** to execute.

**Body lines, in order within the items section:**

- `  thread <id> <path>:<line> (@<author>):` then the full body on subsequent lines indented four spaces — one per actionable review thread. Multi-paragraph bodies are preserved verbatim (empty lines preserved), so code blocks and `\`\`\`suggestion\`\`\`` blocks survive intact.
- `  comment <id> (@<author>):` then the full body on subsequent lines indented four spaces — one per actionable PR-level comment.
- `  check <locator> — <name> (<failureKind|actionable>)` — one per actionable failing check. `<locator>` is the runId for GitHub Actions checks, `external <detailsUrl>` for external status checks (e.g. codecov, vercel) where `runId` is null but a URL is available, and `(no runId)` only when both are null. The numbered instructions split accordingly: `gh run view <runId> --log-failed` for GitHub Actions, open `detailsUrl` manually for external checks.
- `  review <id> (@<author>): changes requested` — one per `CHANGES_REQUESTED` review.
- `  noise (minimize only): <id>, <id>, …` — comments classified as bot noise (quota warnings, rate-limit acks). Minimize on GitHub but do not act on them.
- `  cancelled runs: <id>, <id>, …` — emitted only when CLI-side `gh run cancel` succeeded for at least one run.
- `  base: <branch>` — rebase target for the push step.
- `  resolve: <argv>` — fully-quoted resolve command. `$DISMISS_MESSAGE` and `$HEAD_SHA` are always quoted so substituting a multi-word sentence keeps it as one argument. `--require-sha "$HEAD_SHA"` is appended only when a push is expected (threads/actionableComments/checks/reviews present); noise-only dispatches omit it.
- `  1. …` — ordered instructions to execute. Instruction #6 refers back to the `resolve:` line above rather than duplicating it — always follow that single source of truth.

The JSON payload exposes the same data under `fix.{threads, actionableComments, noiseCommentIds, checks, changesRequestedReviews, baseBranch, resolveCommand, instructions}` plus top-level `cancelled`.

**Resolve command rules (same in text and JSON):**

- `--require-sha "$HEAD_SHA"` is appended only when a push occurred. Noise-only minimizations omit it.
- `$DISMISS_MESSAGE` must be one specific sentence describing what changed — never generic text like "address review comments".

**What the monitor does:** Follow the numbered instructions in order, then stop this iteration to let CI run.

---

## `escalate`

Ambiguous state that requires human judgement — the monitor stops and surfaces details.

**Trigger:** Any of:

- **`fix-thrash`** — same thread dispatched ≥ `config.iterate.fixAttemptsPerThread` times (default 3) without resolving.
- **`pr-level-changes-requested`** — reviewer requested changes but left no inline threads, comments, or CI failures to act on (not triggered when merge conflicts are present).
- **`thread-missing-location`** — an actionable review thread has no file or line reference, so the code location cannot be found automatically.

**CLI side-effects:** None.

**Exit code:** 3

**Text output:**

```
PR #42 [ESCALATE] status=UNRESOLVED_COMMENTS merge=BLOCKED state=OPEN
info: repo=owner/repo passing=0 skipped=0 filtered=0 inProgress=0 remainingSeconds=600 copilotReviewInProgress=false isDraft=false shouldCancel=false

⚠️  /pr-shepherd:monitor paused — needs human direction

Triggers: fix-thrash
Same thread(s) attempted multiple times without resolution — fix manually then rerun /pr-shepherd:monitor

Items needing attention:
- threadId=PRRT_kwDOSGizTs58XB1L src/commands/iterate.mts:42 (@alice): The variable name is misleading

Fix attempts: threadId=PRRT_kwDOSGizTs58XB1L attempted 3 times

Run /pr-shepherd:check 42 to see current state.
After fixing manually, rerun /pr-shepherd:monitor 42 to resume.
```

The block after the `info:` line (separated by a blank line) is `escalate.humanMessage` in JSON — ready to print verbatim.

**What the monitor does:** Print the full output, then invoke `/loop cancel` via Skill tool to stop the cron job.
