# shepherd actions

[← README.md](README.md)

Each iteration of `shepherd iterate` returns exactly one action. See [docs/iterate-flow.md](iterate-flow.md) for the decision order.

The JSON output now includes **prescriptive fields** — pre-built log lines, shell scripts, and resolve commands — so the monitor loop can act without constructing them from raw state.

---

## `cooldown`

Skips all work because the last commit is too fresh for CI checks to have started.

**Trigger:** `nowSeconds − lastCommitTime < cooldownSeconds` (default 30s). No sweep is run.

**CLI side-effects:** None.

**Exit code:** 0

**Key fields:**

| Field | Type     | Description                 |
| ----- | -------- | --------------------------- |
| `log` | `string` | Ready-to-print summary line |

**Example `log`:**

```
SKIP: CI still starting — waiting for first check to appear
```

**What the loop does:** Print `result.log` and wait for the next cron fire.

---

## `wait`

Nothing actionable to do; all CI is passing or in-progress.

**Trigger:** Fallthrough — no actionable work, no terminal state, not ready to mark, no ready-delay elapsed.

**CLI side-effects:** None.

**Exit code:** 0

**Key fields:**

| Field | Type     | Description                                                                   |
| ----- | -------- | ----------------------------------------------------------------------------- |
| `log` | `string` | Summary line including passing count, merge state, and time until auto-cancel |

**Example `log` values:**

| Scenario                             | Log                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Normal wait                          | `WAIT: 3 passing, 2 in-progress — 120s until auto-cancel`                                                 |
| Branch behind base                   | `WAIT: 2 passing, 0 in-progress — branch is behind base — 300s until auto-cancel`                         |
| Blocked                              | `WAIT: 4 passing, 0 in-progress — blocked by pending reviews or required status checks`                   |
| Merge conflicts (no actionable work) | `WAIT: 0 passing, 0 in-progress — merge conflicts — rebase on next push, or now if no pushes are planned` |

**What the loop does:** Print `result.log` and wait for the next cron fire.

---

## `rerun_ci`

Re-triggers CI runs that failed due to transient infrastructure or timeout issues.

**Trigger:** One or more failing checks have `failureKind === "timeout"` or `"infrastructure"`, and no actionable work was found (evaluated after step 4).

**CLI side-effects:** Calls `gh run rerun <runId> --failed` for each unique run ID. Deduplicates — multiple failed steps sharing a run ID produce one rerun call.

**Exit code:** 0

**Key fields:**

| Field   | Type       | Description                    |
| ------- | ---------- | ------------------------------ |
| `reran` | `string[]` | Run IDs that were re-triggered |
| `log`   | `string`   | Ready-to-print summary line    |

**Example `log`:**

```
RERAN 2 CI checks: run-100 run-101
```

**What the loop does:** Print `result.log` and wait for CI to re-queue.

---

## `mark_ready`

Converts a draft PR to ready for review.

**Trigger:** All of: `status === "READY"`, `mergeStateStatus === "CLEAN"` (or `"DRAFT"` when `isDraft`), Copilot review not in progress, `isDraft === true`, ready-delay not elapsed.

**CLI side-effects:** Calls `gh pr ready <PR>` before returning. `markedReady: true` indicates the mutation succeeded.

**Exit code:** 0

**Key fields:**

| Field         | Type      | Description                      |
| ------------- | --------- | -------------------------------- |
| `markedReady` | `boolean` | Whether `gh pr ready` was called |
| `log`         | `string`  | Ready-to-print summary line      |

**Example `log`:**

```
MARKED READY: PR #42 converted from draft to ready for review
```

**What the loop does:** Print `result.log` and continue monitoring.

---

## `cancel`

Stops the monitor loop — no further iterations needed.

**Trigger:** Either the PR is merged or closed (`state !== "OPEN"`), or the ready-delay timer elapsed (`readyState.shouldCancel`).

**CLI side-effects:** None. The `ready-since.txt` file is left in place.

**Exit code:** 2

**Key fields:**

| Field | Type     | Description                        |
| ----- | -------- | ---------------------------------- |
| `log` | `string` | Human-readable reason for stopping |

**Example `log` values:**

| Scenario            | Log                                                                                |
| ------------------- | ---------------------------------------------------------------------------------- |
| PR merged           | `CANCEL: PR #42 is merged — stopping monitor`                                      |
| PR closed           | `CANCEL: PR #42 is closed — stopping monitor`                                      |
| Ready-delay elapsed | `CANCEL: PR #42 has been ready for review — ready-delay elapsed, stopping monitor` |

**What the loop does:** Print `result.log`, then invoke `/loop cancel` via Skill tool to stop the cron job.

---

## `rebase`

Rebases the branch on top of its base to clear flaky failures caused by being behind.

**Trigger:** A failing check has `failureKind === "flaky"` AND `mergeStatus.status === "BEHIND"` AND `config.actions.autoRebase` is enabled.

> Note: merge conflicts (`CONFLICTS`) are handled by `fix_code`, not `rebase`.

**CLI side-effects:** None. The CLI fetches the base branch name via `gh pr view` and pre-builds the shell script.

**Exit code:** 1

**Key fields:**

| Field                | Type     | Description                                          |
| -------------------- | -------- | ---------------------------------------------------- |
| `rebase.baseBranch`  | `string` | The base branch name (e.g. `main`)                   |
| `rebase.reason`      | `string` | Human-readable explanation                           |
| `rebase.shellScript` | `string` | Complete shell script including dirty-worktree guard |

**Example `reason`:**

```
Branch is behind main — rebasing to pick up latest changes and clear flaky failures
```

**Example `shellScript`:**

```bash
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "SKIP rebase: dirty worktree (uncommitted changes present)"
  exit 0
fi
git fetch origin && git rebase origin/main && git push --force-with-lease
```

**What the loop does:** Print `result.rebase.reason`, then run `result.rebase.shellScript` in Bash.

---

## `fix_code`

Actionable work needs a code fix, commit, and push.

**Trigger:** Any of: unresolved inline review threads, actionable PR-level comments, `CHANGES_REQUESTED` reviews, actionable CI failures (`failureKind === "actionable"`), or merge conflicts (`mergeStatus.status === "CONFLICTS"`). Evaluated at step 4, before rerun/rebase.

**CLI side-effects:** Calls `gh run cancel <runId>` for each unique run ID of actionable CI failures (best-effort; already-completed runs are silently ignored). `cancelled` lists the run IDs where cancellation succeeded.

**Exit code:** 1

**Key fields:**

| Field                         | Type             | Description                                                                          |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| `fix.threads`                 | `AgentThread[]`  | Inline review threads (always actionable)                                            |
| `fix.actionableComments`      | `AgentComment[]` | PR-level comments classified as real feedback                                        |
| `fix.noiseCommentIds`         | `string[]`       | Comment IDs classified as noise (quota warnings, bot acks) — minimize, do not act on |
| `fix.checks`                  | `AgentCheck[]`   | Actionable CI failures (deduplicated by run ID)                                      |
| `fix.changesRequestedReviews` | `Review[]`       | Reviews with CHANGES_REQUESTED state                                                 |
| `fix.resolveCommand`          | `ResolveCommand` | Pre-built resolve argv — run after pushing                                           |
| `fix.instructions`            | `string[]`       | Ordered steps for the model to follow                                                |
| `cancelled`                   | `string[]`       | Run IDs successfully cancelled by the CLI                                            |

**`ResolveCommand` fields:**

| Field                    | Type       | Description                                                                       |
| ------------------------ | ---------- | --------------------------------------------------------------------------------- |
| `argv`                   | `string[]` | Shell-join and run; contains `$DISMISS_MESSAGE` placeholder when applicable       |
| `requiresHeadSha`        | `boolean`  | Whether to append `--require-sha <HEAD_SHA>` after a successful push              |
| `requiresDismissMessage` | `boolean`  | Whether to substitute `$DISMISS_MESSAGE` with a specific one-sentence description |

**Example resolve command argv** (threads + comment + review):

```
["npx", "pr-shepherd", "resolve", "42",
 "--resolve-thread-ids", "t-1,t-2",
 "--minimize-comment-ids", "c-1,c-noise",
 "--dismiss-review-ids", "r-1",
 "--message", "$DISMISS_MESSAGE"]
```

Append `--require-sha <HEAD_SHA>` if a push occurred; omit if only noise was handled.

**What the loop does:** Follow `fix.instructions` in order:

1. Apply code fixes for each `fix.threads` and `fix.actionableComments` item.
2. For each `fix.checks[].runId`, fetch the log via `gh run view <runId> --log-failed` and fix the failure. If `runId` is null, tell the user to inspect the check URL manually.
3. Apply changes from each `fix.changesRequestedReviews` item.
4. Commit changed files.
5. Rebase and push; capture `HEAD_SHA`.
6. If only `fix.noiseCommentIds` (no code changes), skip commit/push and omit `--require-sha`.
7. Run the resolve command, substituting `$HEAD_SHA` and (if needed) `$DISMISS_MESSAGE` with a specific description of what you changed. Never use generic text like "address review comments".

---

## `escalate`

Ambiguous state that requires human judgement — the monitor stops and surfaces details.

**Trigger:** Any of:

- **`fix-thrash`** — same thread dispatched ≥ `config.iterate.fixAttemptsPerThread` times (default 3) without resolving.
- **`pr-level-changes-requested`** — reviewer requested changes but left no inline threads, comments, or CI failures to act on (not triggered when merge conflicts are present).
- **`thread-missing-location`** — an actionable review thread has no file or line reference, so the code location cannot be found automatically.

**CLI side-effects:** None.

**Exit code:** 3

**Key fields:**

| Field                              | Type                           | Description                                                                                          |
| ---------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `escalate.triggers`                | `string[]`                     | Which conditions fired (`"fix-thrash"`, `"pr-level-changes-requested"`, `"thread-missing-location"`) |
| `escalate.suggestion`              | `string`                       | One-line action hint                                                                                 |
| `escalate.unresolvedThreads`       | `AgentThread[]`                | Threads needing attention                                                                            |
| `escalate.changesRequestedReviews` | `Review[]`                     | Reviews with CHANGES_REQUESTED state                                                                 |
| `escalate.attemptHistory`          | `Array<{threadId, attempts}>?` | Populated for `fix-thrash`                                                                           |
| `escalate.humanMessage`            | `string`                       | Full printable block ready to show to the human                                                      |

**Example `humanMessage`:**

```
⚠️  /pr-shepherd:monitor paused — needs human direction

Triggers: fix-thrash
Same thread(s) attempted multiple times without resolution — fix manually then rerun /pr-shepherd:monitor

Items needing attention:
- threadId=t-1 src/foo.mts:10 (@alice): The variable name is misleading

Fix attempts: threadId=t-1 attempted 3 times

Run /pr-shepherd:check 42 to see current state.
After fixing manually, rerun /pr-shepherd:monitor to resume.
```

**What the loop does:** Print `result.escalate.humanMessage`, then invoke `/loop cancel` via Skill tool to stop the cron job.
