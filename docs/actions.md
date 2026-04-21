# shepherd actions

[← README.md](README.md)

Each iteration of `shepherd iterate` returns exactly one action. See [docs/iterate-flow.md](iterate-flow.md) for the decision order.

The default output format is text — what you see when running `npx pr-shepherd iterate <PR>`. Pass `--format=json` to get structured output for scripting. Both formats carry equivalent information.

---

## `cooldown`

Skips all work because the last commit is too fresh for CI checks to have started.

**Trigger:** `nowSeconds − lastCommitTime < cooldownSeconds` (default 30s). No sweep is run.

**CLI side-effects:** None.

**Exit code:** 0

**Text output:**

```
PR #42 [COOLDOWN] SKIP: CI still starting — waiting for first check to appear
```

**What the monitor does:** Print the output line and wait for the next cron fire.

---

## `wait`

Nothing actionable to do; all CI is passing or in-progress.

**Trigger:** Fallthrough — no actionable work, no terminal state, not ready to mark, no ready-delay elapsed.

**CLI side-effects:** None.

**Exit code:** 0

**Text output examples:**

| Scenario           | Output                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Normal wait        | `PR #42 [WAIT] WAIT: 3 passing, 2 in-progress — 120s until auto-cancel`                               |
| Branch behind base | `PR #42 [WAIT] WAIT: 2 passing, 0 in-progress — branch is behind base — 300s until auto-cancel`       |
| Blocked            | `PR #42 [WAIT] WAIT: 4 passing, 0 in-progress — blocked by pending reviews or required status checks` |

**What the monitor does:** Print the output line and wait for the next cron fire.

---

## `rerun_ci`

Re-triggers CI runs that failed due to transient infrastructure or timeout issues.

**Trigger:** One or more failing checks have `failureKind === "timeout"` or `"infrastructure"`, and no actionable work was found (evaluated after step 4).

**CLI side-effects:** Calls `gh run rerun <runId> --failed` for each unique run ID. Deduplicates — multiple failed steps sharing a run ID produce one rerun call.

**Exit code:** 0

**Text output:**

```
PR #42 [RERUN_CI] RERAN 2 CI runs: 24697658766 (lint / typecheck / test (22.x) — timeout), 24697658767 (build — infrastructure)
```

**JSON-only fields** (`--format=json`):

| Field   | Type         | Description                                             |
| ------- | ------------ | ------------------------------------------------------- |
| `reran` | `ReranRun[]` | One entry per re-triggered run (deduplicated by run ID) |

**`ReranRun` fields:**

| Field         | Type                            | Description                                          |
| ------------- | ------------------------------- | ---------------------------------------------------- |
| `runId`       | `string`                        | GitHub Actions run ID                                |
| `checkNames`  | `string[]`                      | Check names within this run that triggered the rerun |
| `failureKind` | `"timeout" \| "infrastructure"` | Why the rerun was triggered                          |

**What the monitor does:** Print the output line and wait for CI to re-queue.

---

## `mark_ready`

Converts a draft PR to ready for review.

**Trigger:** All of: `status === "READY"`, `mergeStateStatus === "CLEAN"` (or `"DRAFT"` when `isDraft`), Copilot review not in progress, `isDraft === true`, ready-delay not elapsed.

**CLI side-effects:** Calls `gh pr ready <PR>` before returning. `markedReady: true` indicates the mutation succeeded.

**Exit code:** 0

**Text output:**

```
PR #42 [MARK_READY] MARKED READY: PR #42 converted from draft to ready for review
```

**What the monitor does:** Print the output line and continue monitoring.

---

## `cancel`

Stops the monitor loop — no further iterations needed.

**Trigger:** Either the PR is merged or closed (`state !== "OPEN"`), or the ready-delay timer elapsed (`readyState.shouldCancel`).

**CLI side-effects:** None. The `ready-since.txt` file is left in place.

**Exit code:** 2

**Text output examples:**

| Scenario            | Output                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| PR merged           | `PR #42 [CANCEL] CANCEL: PR #42 is merged — stopping monitor`                                      |
| PR closed           | `PR #42 [CANCEL] CANCEL: PR #42 is closed — stopping monitor`                                      |
| Ready-delay elapsed | `PR #42 [CANCEL] CANCEL: PR #42 has been ready for review — ready-delay elapsed, stopping monitor` |

**What the monitor does:** Print the output line, then invoke `/loop cancel` via Skill tool to stop the cron job.

---

## `rebase`

Rebases the branch on top of its base to clear flaky failures caused by being behind.

**Trigger:** A failing check has `failureKind === "flaky"` AND `mergeStatus.status === "BEHIND"` AND `config.actions.autoRebase` is enabled.

> Note: merge conflicts (`CONFLICTS`) are handled by `fix_code`, not `rebase`.

**CLI side-effects:** None. The CLI fetches the base branch name via `gh pr view` and pre-builds the shell script.

**Exit code:** 1

**Text output:**

```
PR #42 [REBASE] Branch is behind main — rebasing to pick up latest changes and clear flaky failures
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "SKIP rebase: dirty worktree (uncommitted changes present)"
  exit 1
fi
git fetch origin && git rebase origin/main && git push --force-with-lease
```

**What the monitor does:** Print the reason line, then run the shell script shown in the output in Bash.

---

## `fix_code`

Actionable work needs a code fix, commit, and push.

**Trigger:** Any of: unresolved inline review threads, actionable PR-level comments, `CHANGES_REQUESTED` reviews, actionable CI failures (`failureKind === "actionable"`), or merge conflicts (`mergeStatus.status === "CONFLICTS"`). Evaluated at step 4, before rerun/rebase.

**CLI side-effects:** Calls `gh run cancel <runId>` for each unique run ID of actionable CI failures (best-effort; already-completed runs are silently ignored). `cancelled` lists the run IDs where cancellation succeeded.

**Exit code:** 1

**Text output:**

```
PR #42 [FIX_CODE]
  thread PRRT_kwDOSGizTs58XB1L src/commands/iterate.mts:42 (@alice): The variable name is misleading
  comment IC_kwDOSGizTs7_ajT8 (@bob): Consider using a more descriptive name here
  noise (minimize only): IC_kwDOSGizTs7_ajT9
  check 24697658766 — lint / typecheck / test (22.x) (actionable)
  review PRR_kwDOSGizTs58XB1R (@alice): changes requested
  cancelled runs: 24697658765
  base: main
  resolve: npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_kwDOSGizTs58XB1L --minimize-comment-ids IC_kwDOSGizTs7_ajT8,IC_kwDOSGizTs7_ajT9 --dismiss-review-ids PRR_kwDOSGizTs58XB1R --message $DISMISS_MESSAGE --require-sha "$HEAD_SHA"
  1. Apply code fixes from fix.threads and fix.actionableComments.
  2. For each fix.checks[].runId: run gh run view <runId> --log-failed, identify the failure, and apply the fix.
  3. For each fix.changesRequestedReviews: read the review body and apply the requested changes.
  4. Commit changed files: git add <files> && git commit -m "<descriptive message>"
  5. Rebase and push: git fetch origin && git rebase origin/main && git push --force-with-lease — capture HEAD_SHA=$(git rev-parse HEAD)
  6. Run the resolve command (substitute "$HEAD_SHA" with the pushed commit SHA; substitute $DISMISS_MESSAGE with a one-sentence description of what you changed): npx pr-shepherd resolve 42 ...
```

**Resolve command rules:**

- `--require-sha "$HEAD_SHA"` is appended only when a push occurred (threads/checks/reviews present). Omit entirely for noise-only.
- `$DISMISS_MESSAGE` must be one specific sentence describing what changed — never generic text like "address review comments".

**JSON-only fields** (`--format=json`): `fix.threads`, `fix.actionableComments`, `fix.noiseCommentIds`, `fix.checks`, `fix.changesRequestedReviews`, `fix.baseBranch`, `fix.resolveCommand`, `fix.instructions`, `cancelled`.

**What the monitor does:** Follow the numbered instructions shown in the output, then stop the iteration to let CI run.

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
PR #42 [ESCALATE]
⚠️  /pr-shepherd:monitor paused — needs human direction

Triggers: fix-thrash
Same thread(s) attempted multiple times without resolution — fix manually then rerun /pr-shepherd:monitor

Items needing attention:
- threadId=PRRT_kwDOSGizTs58XB1L src/commands/iterate.mts:42 (@alice): The variable name is misleading

Fix attempts: threadId=PRRT_kwDOSGizTs58XB1L attempted 3 times

Run /pr-shepherd:check 42 to see current state.
After fixing manually, rerun /pr-shepherd:monitor 42 to resume.
```

**What the monitor does:** Print the full output, then invoke `/loop cancel` via Skill tool to stop the cron job.
