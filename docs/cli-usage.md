# pr-shepherd CLI reference

[← README](../README.md)

```
pr-shepherd -v|--version
pr-shepherd check [PR]
pr-shepherd resolve [PR] [--fetch | --resolve-thread-ids … | --minimize-comment-ids … | --dismiss-review-ids … | --message "…" | --require-sha <sha> | --last-push-time <ts>]
pr-shepherd commit-suggestion [PR] --thread-id <id> --message "…"
pr-shepherd iterate [PR] [--cooldown-seconds N] [--ready-delay Nm] [--last-push-time N] [--stall-timeout <duration>] [--no-auto-mark-ready] [--no-auto-cancel-actionable]
pr-shepherd status PR1 [PR2 …]
```

## Common flags

All subcommands accept:

| Flag                  | Default | Description                                                                         |
| --------------------- | ------- | ----------------------------------------------------------------------------------- |
| `--format text\|json` | `text`  | Output format                                                                       |
| `--no-cache`          | false   | Bypass the 5-minute file cache                                                      |
| `--cache-ttl N`       | `300`   | Cache TTL in seconds; takes precedence over `PR_SHEPHERD_CACHE_TTL_SECONDS` env var |

### pr-shepherd check [PR]

Read-only PR status snapshot. Fetches CI results, merge state, and review comments in one GraphQL batch. PR number is inferred from the current branch when omitted.

```sh
pr-shepherd check           # infer PR from current branch
pr-shepherd check 42
pr-shepherd check 42 --no-cache
```

Exit codes: `0` READY · `2` IN_PROGRESS · `3` UNRESOLVED_COMMENTS · `1` all other statuses

**Example output:**

```
PR #42 — owner/repo
Status: UNRESOLVED_COMMENTS

## Merge Status

CLEAN
  mergeStateStatus:        CLEAN
  mergeable:               MERGEABLE
  reviewDecision:          APPROVED
  isDraft:                 false
  copilotReviewInProgress: false

## CI Checks

3/3 passed

## Review Threads

### Actionable (1)

- threadId=RT_kwDOBxyz123 src/api.ts:47 (@reviewer)
  Please add error handling here

## Summary

1 actionable item(s) remaining

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
# PR #42 — Resolve fetch (2 actionable)

## Actionable Review Threads (2) [commit-suggestions: enabled]

- `threadId=RT_kwDOabc` `src/api.ts:47` (@reviewer): Please add error handling here
- `threadId=RT_kwDOdef` `src/utils.ts:12` (@alice) [suggestion]: Replace manual loop with Array.from

## Summary

2 actionable item(s)

## Instructions

1. For each thread marked `[suggestion]`: run `npx pr-shepherd commit-suggestion 42 --thread-id <id> --message "<message>" --format=json` (one thread at a time). On `applied: false`, fall through to step 2 for that thread.
2. For remaining threads (no suggestion, or commit-suggestion failed): read and edit the referenced files.
3. Commit changed files and push: `git add <files> && git commit -m "<message>"`, then rebase and push.
4. Run `npx pr-shepherd resolve 42 [--resolve-thread-ids <ids>] …` with the appropriate flags.
```

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

| Flag                     | Description                                                                  |
| ------------------------ | ---------------------------------------------------------------------------- |
| `--fetch`                | Fetch mode (default when no mutation flags are given)                        |
| `--resolve-thread-ids`   | Comma-separated thread IDs to mark resolved                                  |
| `--minimize-comment-ids` | Comma-separated comment or review-summary IDs to minimize                    |
| `--dismiss-review-ids`   | Comma-separated `CHANGES_REQUESTED` review IDs to dismiss                    |
| `--message`              | Dismiss message (required when `--dismiss-review-ids` is set)                |
| `--require-sha`          | Poll GitHub until the PR head matches this SHA before mutating               |
| `--last-push-time`       | Unix timestamp of the most recent push (used internally by the monitor loop) |

`--require-sha` polls `GET /repos/{owner}/{repo}/pulls/{pr}` for `headRefOid` until it matches, then issues the mutations — ensures reviewers see the fix before threads are closed. Exit code: always `0`. `--message` must describe the specific fix; it is shown to the reviewer on GitHub.

### pr-shepherd commit-suggestion [PR] --thread-id <id> --message "…"

Applies a single reviewer ` ```suggestion ` fenced block as a local git commit. Builds a unified diff from the suggestion, validates it with `git apply --check`, writes the file, and commits with the caller-supplied message plus a `Co-authored-by: <reviewer>` trailer. Resolves the thread on GitHub after the commit lands. Never pushes — the output tells the caller to `git push` when ready.

```sh
pr-shepherd commit-suggestion 42 \
  --thread-id PRRT_abc \
  --message "trim trailing whitespace per reviewer" \
  --description "Optional longer body text."
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

Exit codes: `0` suggestion applied and committed · `1` any error.

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
pr-shepherd iterate 42 --no-cache \
  --ready-delay 10m \
  --last-push-time "$(git log -1 --format=%ct HEAD)"
```

**Flags:**

| Flag                          | Default | Description                                                     |
| ----------------------------- | ------- | --------------------------------------------------------------- |
| `--ready-delay Nm`            | `10m`   | Settle window before the loop cancels after READY               |
| `--cooldown-seconds N`        | `30`    | Wait after a push before reading CI                             |
| `--last-push-time N`          | —       | Unix timestamp hint embedded in the result                      |
| `--stall-timeout <duration>`  | `30m`   | Override the stall-detection window (e.g. `--stall-timeout 1h`) |
| `--no-auto-mark-ready`        | false   | Skip converting draft → ready-for-review                        |
| `--no-auto-cancel-actionable` | false   | Skip cancelling actionable failing runs                         |

**Default (Markdown) output.** Every action emits an H1 heading, a bolded base-fields line, a bolded summary line, then an action-specific body. Example for `[WAIT]`:

```markdown
# PR #42 [WAIT]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 3 passing, 0 skipped, 0 filtered, 0 inProgress · **remainingSeconds** 540 · **copilotReviewInProgress** false · **isDraft** false · **shouldCancel** false

WAIT: 3 passing, 0 in-progress — 540s until auto-cancel

## Instructions

1. End this iteration — the next cron fire will recheck.
```

Example for `[FIX_CODE]` (richest action):

```markdown
# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 3 passing, 0 skipped, 0 filtered, 0 inProgress · **remainingSeconds** 600 · **copilotReviewInProgress** false · **isDraft** false · **shouldCancel** false

## Checks

- ✓ `build` — SUCCESS
- ✗ `lint / typecheck / test (22.x)` (actionable) — FAILURE · `24697658766`
  > Error: expected 'foo' to equal 'bar'

## Review threads

### `PRRT_kwDOSGizTs58XB1L` — `src/commands/iterate.mts:42` (@alice)

> The variable name is misleading.
>
> Consider renaming `x` to `remainingSeconds`.

## Failing checks

- `24697658766` — `lint / typecheck / test (22.x)` (actionable)

## Post-fix push

- base: `main`
- resolve: `npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_kwDOSGizTs58XB1L --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Apply code fixes: read and edit each file referenced under `## Review threads` and `## Actionable comments` above.
2. For each bullet in `## Failing checks` whose backticked locator is a numeric runId (GitHub Actions): run `gh run view <runId> --log-failed`, identify the failure, and apply the fix.
3. Commit changed files: `git add <files> && git commit -m "<descriptive message>"`
4. Keep the PR title and description current: if the changes alter the PR's scope or intent, run `gh pr edit 42 --title "<new title>" --body "<new body>"` to reflect them. Skip if the existing title/body still accurately describe the PR.
5. Rebase and push: `git fetch origin && git rebase origin/main && git push --force-with-lease` — capture `HEAD_SHA=$(git rev-parse HEAD)`
6. Run the `resolve:` command shown above, substituting "$HEAD_SHA" with the pushed commit SHA and $DISMISS_MESSAGE with a one-sentence description of what you changed.
7. Stop this iteration — CI needs time to run on the new push before the next tick.
```

See [actions.md](actions.md) for all eight actions and their complete output shapes.

Both `--format=text` (default Markdown) and `--format=json` carry equivalent information — every field exposed in JSON has a corresponding Markdown representation, and vice versa.

Exit codes: `0` wait/cooldown/rerun_ci/mark_ready · `1` fix_code/rebase · `2` cancel · `3` escalate

### pr-shepherd status PR1 [PR2 …]

Multi-PR summary table. One lightweight GraphQL query per PR, run in parallel.

```sh
pr-shepherd status 41 42 43
pr-shepherd status 100
```

```
# owner/repo — PR status (3)

PR #41    Add new feature for user authentication           READY        SUCCESS
PR #42    Refactor internal module                          IN PROGRESS  PENDING
PR #43    Fix edge case in parser                           BLOCKED      SUCCESS (threads truncated — run pr-shepherd check for full count)
```

Exit code: `0` if every PR is READY, `1` otherwise.
