# pr-shepherd CLI reference

[← README](../README.md)

```
pr-shepherd -v|--version
pr-shepherd check [PR]
pr-shepherd resolve [PR] [--fetch | --resolve-thread-ids … | --minimize-comment-ids … | --dismiss-review-ids … | --message "…" | --require-sha <sha>]
pr-shepherd commit-suggestion [PR] --thread-id <id> --message "…"
pr-shepherd iterate [PR] [--verbose] [--cooldown-seconds N] [--ready-delay Nm] [--stall-timeout <duration>] [--no-auto-mark-ready] [--no-auto-cancel-actionable]
pr-shepherd monitor [PR]
pr-shepherd status PR1 [PR2 …]
pr-shepherd log-file
```

## Common flags

All subcommands accept:

| Flag                  | Default | Description                                                                                       |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `--format text\|json` | `text`  | Output format                                                                                     |
| `--verbose`           | false   | (`iterate` only) emit full `IterateResult` JSON / show all base/summary fields in Markdown output |

### pr-shepherd check [PR]

Read-only PR status snapshot. Fetches CI results, merge state, and review comments in one GraphQL batch. PR number is inferred from the current branch when omitted.

```sh
pr-shepherd check           # infer PR from current branch
pr-shepherd check 42
```

Exit codes: `0` READY · `2` IN_PROGRESS · `3` UNRESOLVED_COMMENTS · `1` all other statuses

**Example output:**

```
# PR #42 [CHECK] — owner/repo
Status: UNRESOLVED_COMMENTS
Base: main

## Merge Status

- status: `CLEAN`
- mergeStateStatus: `CLEAN`
- mergeable: `MERGEABLE`
- reviewDecision: `APPROVED`
- isDraft: `false`
- copilotReviewInProgress: `false`

## CI Checks

3/3 passed

## Review Threads

### Actionable (1)

- `threadId=RT_kwDOBxyz123` [↗](https://github.com/owner/repo/pull/42#discussion_r1234567890) `src/api.ts:47` (@reviewer): Please add error handling here

## Summary

1 actionable

## Instructions

1. Report: merge status is CLEAN, CI 3/3 passed, 1 actionable review item(s).
2. Do not declare this PR ready to merge: status is UNRESOLVED_COMMENTS (not READY).
3. This is a one-shot check. For continuous monitoring that acts on these signals automatically, use `/pr-shepherd:monitor`.
```

### pr-shepherd resolve [PR]

Two modes: **fetch** (default) auto-resolves outdated threads and returns actionable items; **mutate** resolves/minimizes/dismisses specific IDs after you push fixes.

**Fetch mode:**

```sh
pr-shepherd resolve           # fetch + auto-resolve outdated threads
pr-shepherd resolve 42 --fetch
```

```markdown
# PR #42 — Resolve fetch (2 actionable, 1 first-look)

## Actionable Review Threads (2) [commit-suggestions: enabled]

- `threadId=RT_kwDOabc` `src/api.ts:47` (@reviewer): Please add error handling here
- `threadId=RT_kwDOdef` `src/utils.ts:12` (@alice) [suggestion]: Replace manual loop with Array.from

## First-look items (1) — already closed on GitHub; acknowledge only

- `threadId=RT_kwDOghi` `src/old.ts:9` (@bob) [status: outdated, auto-resolved]: This variable name is confusing

## Summary

2 actionable, 1 first-look

## Instructions

1. Classify every item listed above …
2. Items in `## First-look items` are already closed on GitHub — do not pass their IDs to `--resolve-thread-ids`, `--minimize-comment-ids`, or `--dismiss-review-ids`. Acknowledge each one with a one-line classification.
3. For each thread marked `[suggestion]`: run `npx pr-shepherd commit-suggestion 42 --thread-id <id> --message "<message>" --format=json` (one thread at a time). On `applied: false`, fall through to step 4 for that thread.
4. For remaining threads (no suggestion, or commit-suggestion failed): read and edit the referenced files.
5. Commit changed files and push: `git add <files> && git commit -m "<message>"`, then rebase and push.
6. Run `npx pr-shepherd resolve 42 [--resolve-thread-ids <ids>] …` with the appropriate flags.
```

First-look items (threads / comments that are outdated, resolved, or minimized on GitHub) are surfaced on first fetch only; a per-item seen-marker file suppresses them on subsequent fetches. They carry a `[status: …]` tag: `outdated`, `outdated, auto-resolved`, `resolved`, or `minimized`. Do not include first-look IDs in resolve mutations — they are already closed.

The `[suggestion]` marker appears on threads whose body contains a ` ```suggestion ` fenced block and `actions.commitSuggestions` is enabled. See the [`commit-suggestion` section](#pr-shepherd-commit-suggestion-pr---thread-id-id---message) below for how to apply them.

**Mutate mode** (after pushing fixes):

```sh
pr-shepherd resolve 42 \
  --resolve-thread-ids RT_kwDOabc,RT_kwDOdef \
  --minimize-comment-ids IC_kwDOxyz \
  --dismiss-review-ids PRR_kwDO123 \
  --message "Switched query to parameterized form in src/db.ts" \
  --require-sha $(git rev-parse HEAD)
```

```
Resolved threads (2): RT_kwDOabc, RT_kwDOdef
Minimized comments (1): IC_kwDOxyz
Dismissed reviews (1): PRR_kwDO123
```

**Flags:**

| Flag                     | Description                                                    |
| ------------------------ | -------------------------------------------------------------- |
| `--fetch`                | Fetch mode (default when no mutation flags are given)          |
| `--resolve-thread-ids`   | Comma-separated thread IDs to mark resolved                    |
| `--minimize-comment-ids` | Comma-separated comment or review-summary IDs to minimize      |
| `--dismiss-review-ids`   | Comma-separated `CHANGES_REQUESTED` review IDs to dismiss      |
| `--message`              | Dismiss message (required when `--dismiss-review-ids` is set)  |
| `--require-sha`          | Poll GitHub until the PR head matches this SHA before mutating |

`--require-sha` polls `GET /repos/{owner}/{repo}/pulls/{pr}` for `headRefOid` until it matches, then issues the mutations — ensures reviewers see the fix before threads are closed. Exit code: always `0`. `--message` must describe the specific fix; it is shown to the reviewer on GitHub.

### pr-shepherd commit-suggestion [PR] --thread-id <id> [--message "…"] [--dry-run]

Applies a single reviewer ` ```suggestion ` fenced block as a local git commit. Builds a unified diff from the suggestion, validates it with `git apply --check`, writes the file, and commits with the caller-supplied message plus a `Co-authored-by: <reviewer>` trailer. Resolves the thread on GitHub after the commit lands. Never pushes — the output tells the caller to `git push` when ready.

```sh
pr-shepherd commit-suggestion 42 \
  --thread-id PRRT_abc \
  --message "trim trailing whitespace per reviewer" \
  --description "Optional longer body text."
```

Pass `--dry-run` to preview the unified diff without modifying the working tree, staging, committing, or resolving the thread. (A temporary patch file is still written to the OS temp dir for `git apply --check`, but no working-tree files are changed.) `--message` is optional in dry-run mode. Exit code: `0` when the patch would apply cleanly, `1` on drift.

```sh
pr-shepherd commit-suggestion 42 --thread-id PRRT_abc --dry-run
```

Requires a clean working tree and that the current branch matches the PR head ref. Precondition or lookup failures (wrong branch, thread not found, already resolved, outdated, no suggestion block, nested fencing) are hard errors with specific reason strings. Patch rejection is a normal result with `applied: false` plus a `reason` — the CLI exits `1`. There is no `skipped` state; the caller must handle or retry hard errors or `applied: false` results.

Gated by `actions.commitSuggestions` (default `true`) — `/pr-shepherd:resolve` calls this automatically for threads that `resolve --fetch` annotates with `[suggestion]`.

**Example output (success):**

````
Applied suggestion from @alice:
  src/foo.ts (line 42)
Commit: abc1234

```diff
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -42 +42 @@
-const x = computeRemaining();
+const remainingSeconds = computeRemaining();
```

Run `git push` (or `git push --force-with-lease` after rebasing) to publish the commit.
````

**Example output (--dry-run, patch valid):**

````
Dry-run: would apply suggestion from @alice:
  src/foo.ts (line 42)

```diff
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -42 +42 @@
-const x = computeRemaining();
+const remainingSeconds = computeRemaining();
```

Re-run without --dry-run to apply and commit.
````

**Example output (failure — patch rejected):**

````
Failed to apply suggestion PRRT_abc:
  path: src/foo.ts (lines 10-12)
  author: @alice
  reason: git apply rejected the patch: error: patch failed: src/foo.ts:10

```diff
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -10,3 +10,1 @@
 // context line
-const oldLine1 = value1;
-const oldLine2 = value2;
+const newLine = value;
```
````

Exit codes: `0` suggestion applied and committed, or dry-run patch is clean · `1` any error or dry-run drift.

**Applying multiple suggestions.** Invoke once per thread — the command handles one suggestion at a time. For a PR with multiple suggestion threads, run in sequence then push all the resulting commits together:

```sh
pr-shepherd commit-suggestion 42 --thread-id PRRT_aaa --message "rename x to remainingSeconds"
pr-shepherd commit-suggestion 42 --thread-id PRRT_bbb --message "simplify loop body"
git push
```

If `commit-suggestion` exits `1`, apply the fix manually as a regular code edit.

### pr-shepherd iterate [PR]

One monitor tick: classifies current PR state and emits a single action. Used by the cron loop — the monitor skill calls this on each tick and follows the `## Instructions` section verbatim. See [iterate-flow.md](iterate-flow.md) for the decision tree and [actions.md](actions.md) for every action's full output shape.

```sh
pr-shepherd iterate 42
pr-shepherd iterate 42 --ready-delay 15m  # override ready-delay for this run
```

**Flags:**

| Flag                          | Default                                 | Description                                                                                          |
| ----------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `--verbose`                   | false                                   | Full JSON output (all fields); restores full summary line in Markdown. See [actions.md](actions.md). |
| `--ready-delay Nm`            | `watch.readyDelayMinutes` in config     | Settle window before the loop cancels after READY                                                    |
| `--cooldown-seconds N`        | `iterate.cooldownSeconds` in config     | Wait after a push before reading CI                                                                  |
| `--stall-timeout <duration>`  | `iterate.stallTimeoutMinutes` in config | Override the stall-detection window (e.g. `--stall-timeout 1h`)                                      |
| `--no-auto-mark-ready`        | false                                   | Skip converting draft → ready-for-review                                                             |
| `--no-auto-cancel-actionable` | false                                   | Skip cancelling actionable failing runs                                                              |

**Default (Markdown) output.** Every action emits an H1 heading, a bolded base-fields line, a bolded summary line, then an action-specific body. Zero counts (`skipped`, `filtered`, `inProgress`) are omitted in lean mode; `copilotReviewInProgress` and `isDraft` are only shown when `true`; `shouldCancel` is never shown. Example for `[WAIT]`:

```markdown
# PR #42 [WAIT]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 3 passing · **remainingSeconds** 540

WAIT: 3 passing, 0 in-progress — 540s until auto-cancel

## Instructions

1. End this iteration — the next cron fire will recheck.
```

Example for `[FIX_CODE]` (richest action):

```markdown
# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 3 passing

## Review threads

### `threadId=PRRT_kwDOSGizTs58XB1L` — `src/commands/iterate.mts:42` (@alice)

> The variable name is misleading.
>
> Consider renaming `x` to `remainingSeconds`.

## Failing checks

- `24697658766` — `CI › lint / typecheck / test (22.x)`
  > Run tests
```

Error: expected 'foo' to equal 'bar'
at Object.<anonymous> (src/commands/iterate.test.mts:58:22)

```

## Post-fix push

- base: `main`
- resolve: `npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_kwDOSGizTs58XB1L --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Apply code fixes: read and edit each file referenced under `## Review threads` and `## Actionable comments` above.
2. For each failing check under `## Failing checks` with a run ID, examine the log tail in the fenced block to decide what to do:
   - If the log tail shows a transient runner or infrastructure failure (network timeout, runner setup crash, OOM kill), run `gh run rerun <runId> --failed` and stop this iteration — CI will re-run automatically.
   - If the log tail shows a real test or build failure, apply a code fix.
   - If the fenced log block is absent, run `gh run view <runId> --log-failed` first to fetch it, then choose between rerun and fix above.
3. Commit changed files: `git add <files> && git commit -m "<descriptive message>"`
4. Keep the PR title and description current: if the changes alter the PR's scope or intent, run `gh pr edit 42 --title "<new title>" --body "<new body>"` to reflect them. Skip if the existing title/body still accurately describe the PR.
5. Rebase and push: `git fetch origin && git rebase origin/main && git push --force-with-lease` — capture `HEAD_SHA=$(git rev-parse HEAD)`
6. Run the `resolve:` command shown above, substituting "$HEAD_SHA" with the pushed commit SHA and $DISMISS_MESSAGE with a one-sentence description of what you changed.
7. For any large decisions made, add or update a `## Shepherd Journal` section in the PR description: `gh pr edit 42 --body …`
8. Stop this iteration — CI needs time to run on the new push before the next tick.
```

See [actions.md](actions.md) for all six actions and their complete output shapes.

Both `--format=text` (default Markdown) and `--format=json` carry equivalent information — every field exposed in JSON has a corresponding Markdown representation, and vice versa.

Exit codes: `0` wait/cooldown/mark_ready · `1` fix_code · `2` cancel · `3` escalate

### pr-shepherd monitor [PR]

Bootstrap command for `/pr-shepherd:monitor`. Reads `watch.interval` from config and emits the loop prompt body (for inline single-iteration use) and a short `Loop args` line (the interval). The monitor skill invokes this command and follows its `## Instructions` to either run one iteration inline (if a loop already exists) or start a new `/loop`.

```sh
npx pr-shepherd monitor        # infer PR from current branch
npx pr-shepherd monitor 42
```

**Example output:**

```markdown
# PR #42 [MONITOR]

Loop tag: `#pr-shepherd-loop:pr=42:`
Loop args: `4m`

## Loop prompt

#pr-shepherd-loop:pr=42:

**IMPORTANT — recurrence rules:**
...

## Instructions

1. Run `CronList`. If any job's prompt contains `#pr-shepherd-loop:pr=42:`, run the `## Loop prompt` body once inline (as if it were a cron tick) then stop — do not create a duplicate loop.
2. Otherwise, invoke the `/loop` skill via the Skill tool. Build the `args` parameter as: only the value inside the backticks on the `Loop args` line above (the interval — not the `Loop args:` label), then a blank line, then the full `## Loop prompt` body.
```

The loop interval comes from `watch.interval` in `.pr-shepherdrc.yml` or the built-in default. Use `--format=json` to inspect the raw values programmatically.

Exit code: `0`

### pr-shepherd status PR1 [PR2 …]

Multi-PR summary table. One lightweight GraphQL query per PR, run in parallel.

```sh
pr-shepherd status 41 42 43
pr-shepherd status 100
```

```
# owner/repo — PR status (3)

| PR | Title | Verdict | CI |
| --- | --- | --- | --- |
| #41 | Add new feature for user authentication | READY | SUCCESS |
| #42 | Refactor internal module | IN PROGRESS | PENDING |
| #43 | Fix edge case in parser | BLOCKED | SUCCESS |

> Note: PR #43 threads truncated — run `pr-shepherd check 43` for full count.
```

Exit code: `0` if every PR is READY, `1` otherwise.

### pr-shepherd log-file

Prints the path of the per-worktree append-only debug log for the current repository. The file is created on the first invocation of any other subcommand.

```sh
pr-shepherd log-file             # prints path
pr-shepherd log-file --format=json  # {"path":"…"}
```

```
/var/folders/…/pr-shepherd-state/owner-repo/worktrees/my-branch-3f4a9b21.md
```

The log captures, for each CLI invocation:

- A session header (ISO-8601 timestamp · pid · version · full argv)
- Every GraphQL request and response (query, variables, response body)
- Every REST JSON request and response (method, path, body, status)
- Every `restText` request/response — metadata only (status · content-length), body never logged
- Full stdout output (text or JSON) emitted by the subcommand

All entries carry an ISO-8601 millisecond timestamp. HTTP response entries also show elapsed milliseconds. Auth headers are never written to the log.

**Disable logging:** set `PR_SHEPHERD_LOG_DISABLED=1`. Logging is also automatically disabled when `CI=true` or when the first write fails.

**Override base directory:** set `PR_SHEPHERD_STATE_DIR` (same env var as the loop-state directory). The log lives at `$PR_SHEPHERD_STATE_DIR/<owner>-<repo>/worktrees/<basename>-<sha8>.md`.

Exit code: `0` on success · `1` if not in a git repo or repo identity cannot be resolved.
