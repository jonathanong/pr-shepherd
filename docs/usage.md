# pr-shepherd CLI usage

[← README](../README.md)

```
pr-shepherd -v|--version                              # print installed version
pr-shepherd check [PR]                                # read-only PR status snapshot
pr-shepherd resolve [PR] [--fetch | --resolve-thread-ids …]
pr-shepherd commit-suggestion [PR] --thread-id A --message "msg"  # apply one reviewer suggestion as a local commit
pr-shepherd iterate [PR] [--cooldown-seconds N] [--ready-delay Nm] [--last-push-time N]
pr-shepherd status PR1 [PR2 …]                        # multi-PR table
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
pr-shepherd check 42 --format=json
pr-shepherd check 42 --no-cache
```

Exit codes: `0` READY · `2` IN_PROGRESS · `3` UNRESOLVED_COMMENTS · `1` all other statuses

**Example output:**

```
PR #42 — owner/repo
Status: UNRESOLVED_COMMENTS

Merge Status: CLEAN
  mergeStateStatus:       CLEAN
  mergeable:              MERGEABLE
  reviewDecision:         APPROVED
  isDraft:                false
  copilotReviewInProgress:false

CI Checks: 3/3 passed

Actionable Review Threads (1):
  - threadId=RT_kwDOBxyz123 src/api.ts:47 (@reviewer)
    Please add error handling here

Summary: 1 actionable item(s) remaining
```

### pr-shepherd resolve [PR]

Two modes: **fetch** (default) auto-resolves outdated threads and returns actionable items; **mutate** resolves/minimizes/dismisses specific IDs after you push fixes.

**Fetch mode:**

```sh
pr-shepherd resolve           # fetch + auto-resolve outdated threads
pr-shepherd resolve 42 --fetch --format=json
```

```
# PR #42 — Resolve fetch (2 actionable)

## Actionable Review Threads (2)

- `threadId=RT_kwDOabc` `src/api.ts:47` (@reviewer): Please add error handling here
- `threadId=RT_kwDOdef` `src/utils.ts:12` (@bot): Consider using a const here

## Summary

2 actionable item(s)

## Instructions

1. Classify every item listed above into exactly one of: Fixed / Actionable / Not relevant / Outdated / Acknowledge. …
2. Read and edit each file referenced under `## Actionable Review Threads` above. …
3. Commit changed files and push: `git add <files> && git commit -m "<message>"`, then rebase and push. …
4. Run `npx pr-shepherd resolve 42 [--resolve-thread-ids <ids>] …` with only the non-empty flag subsets. …
5. Report: echo the CLI's mutation output, then one line per Acknowledged item. …
```

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

`--require-sha` polls GitHub until the PR head matches the SHA before mutating — ensures reviewers see the fix before threads are closed. Exit code: always `0`. `--message` is required only when `--dismiss-review-ids` is set, and should describe the specific fix — it is shown to the reviewer on GitHub.

### pr-shepherd commit-suggestion [PR] --thread-id A --message "…"

Applies a single reviewer `suggestion` fenced block as a local git commit. Builds a unified diff from the suggestion, validates it against the working tree with `git apply --check`, writes the file, and commits with the caller-supplied message plus a `Co-authored-by: <reviewer>` trailer. The thread is resolved on GitHub after the commit lands. The CLI never pushes — `postActionInstruction` tells the caller to `git push` when ready.

```sh
pr-shepherd commit-suggestion 42 \
  --thread-id PRRT_abc \
  --message "trim trailing whitespace per reviewer" \
  --description "Optional longer body text." \
  --format=json
```

Requires a clean working tree and that the current branch matches the PR head ref. Precondition/lookup failures such as wrong branch, thread not found, already resolved, outdated, no suggestion block, or nested fencing are hard errors with specific reason strings. Patch rejection is reported as a normal result with `applied: false` plus a specific `reason` (and the generated `patch`), and the CLI exits `1`. Unlike the bulk command there is no `skipped` state; the caller must handle or retry either hard errors or `applied: false` results.

Gated by `actions.commitSuggestions` (default `true`) — `/pr-shepherd:resolve` calls this automatically for threads that `resolve --fetch` annotates with a `suggestion` field.

Example JSON output (success):

```json
{
  "pr": 42,
  "repo": "owner/repo",
  "threadId": "PRRT_abc",
  "path": "src/foo.ts",
  "startLine": 10,
  "endLine": 12,
  "author": "alice",
  "commitSha": "abc1234",
  "applied": true,
  "postActionInstruction": "Run `git push` to publish the commit."
}
```

Example JSON output (failure — patch rejected):

```json
{
  "pr": 42,
  "repo": "owner/repo",
  "threadId": "PRRT_abc",
  "path": "src/foo.ts",
  "startLine": 10,
  "endLine": 12,
  "author": "alice",
  "applied": false,
  "reason": "git apply rejected the patch: error: patch failed: src/foo.ts:10",
  "patch": "<full unified diff text>"
}
```

Exit codes: `0` suggestion applied and committed · `1` any error.

### pr-shepherd iterate [PR]

One monitor tick: classifies current PR state and emits a single action. Used by the cron loop; the monitor skill calls this every 4 minutes and acts on the result. See [iterate-flow.md](iterate-flow.md) for the full decision tree.

```sh
pr-shepherd iterate 42 --no-cache --format=json \
  --ready-delay 10m \
  --last-push-time "$(git log -1 --format=%ct HEAD)"
```

Flags:

| Flag                          | Default | Description                                       |
| ----------------------------- | ------- | ------------------------------------------------- |
| `--ready-delay Nm`            | `10m`   | Settle window before the loop cancels after READY |
| `--cooldown-seconds N`        | `30`    | Wait after a push before reading CI               |
| `--last-push-time N`          | —       | Unix timestamp hint embedded in the result        |
| `--no-auto-mark-ready`        | false   | Skip converting draft → ready-for-review          |
| `--no-auto-cancel-actionable` | false   | Skip cancelling actionable failing runs           |

**Markdown output** (default). The monitor SKILL reads the `[ACTION]` tag from the H1 heading to decide what to do. Every action emits an H1, a bolded base-fields line, a bolded summary line, then an action-specific body. Example for `[WAIT]`:

```markdown
# PR #42 [WAIT]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 3 passing, 0 skipped, 0 filtered, 0 inProgress · **remainingSeconds** 540 · **copilotReviewInProgress** false · **isDraft** false · **shouldCancel** false

WAIT: 3 passing, 0 in-progress — 540s until auto-cancel
```

See [actions.md](actions.md) for the other seven actions — `cooldown`, `rerun_ci`, `mark_ready`, `cancel`, `rebase`, `fix_code`, `escalate`. `fix_code` is the richest: it emits sections for `## Review threads`, `## Actionable comments`, `## Failing checks`, `## Changes-requested reviews`, `## Noise (minimize only)`, `## Cancelled runs`, `## Post-fix push`, and `## Instructions`.

Both `--format=text` (default Markdown) and `--format=json` carry equivalent information — every field exposed in JSON has a corresponding Markdown representation, and vice versa.

**JSON output** (`--format=json`, compact single line):

```json
{
  "pr": 42,
  "repo": "owner/repo",
  "status": "READY",
  "state": "OPEN",
  "mergeStateStatus": "CLEAN",
  "copilotReviewInProgress": false,
  "isDraft": false,
  "shouldCancel": false,
  "remainingSeconds": 540,
  "summary": { "passing": 3, "skipped": 0, "filtered": 0, "inProgress": 0 },
  "action": "wait"
}
```

Exit codes: `0` wait/cooldown/rerun_ci/mark_ready · `1` fix_code/rebase · `2` cancel · `3` escalate

### pr-shepherd status PR1 [PR2 …]

Multi-PR summary table. One lightweight GraphQL query per PR, run in parallel.

```sh
pr-shepherd status 41 42 43
pr-shepherd status 100 --format=json
```

```

# owner/repo — PR status (3)

PR #41    Add new feature for user authentication           READY        SUCCESS
PR #42    Refactor internal module                          IN PROGRESS  PENDING
PR #43    Fix edge case in parser                           BLOCKED      SUCCESS (threads truncated — run pr-shepherd check for full count)
```

Exit code: `0` if every PR is READY, `1` otherwise.
