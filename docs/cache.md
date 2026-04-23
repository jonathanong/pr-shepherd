# shepherd cache

[← README.md](README.md) | [ready-delay.md](ready-delay.md)

## File layout

All cache files live under:

```
$TMPDIR/pr-shepherd-cache/<owner>-<repo>/<pr>/
```

Or under `$PR_SHEPHERD_CACHE_DIR/<owner>-<repo>/<pr>/` when the env var is set.

For `batch-read.json`, the `owner`, `repo`, and `shape` segments are each validated against `[a-zA-Z0-9._-]+` in `cache/file-cache.mts` to prevent path traversal. The `ready-since.txt` path is constructed directly in `commands/ready-delay.mts` without this validation — it relies on the PR number (an integer) and the `owner`/`repo` values already validated by the GitHub API client.

## Files

### `batch-read.json`

**Content:** Full JSON snapshot of the batched GraphQL response (CI checks + review threads + PR comments + merge state).

**TTL:** 5 minutes (or `$PR_SHEPHERD_CACHE_TTL_SECONDS`), configurable via `--cache-ttl <N>` flag.

**Written:** On every cache miss, after a successful GraphQL fetch.

**Not written when:** `mergeable === 'UNKNOWN'` or `mergeStateStatus === 'UNKNOWN'` — transient state would poison the cache for the full TTL window, causing stale UNKNOWN status on the next sweep.

**Bypassed when:** `autoResolve` is enabled (mutation path always fetches fresh data) or `--no-cache` flag is set.

### `fix-attempts.json`

**Content:** `{ headSha, threadAttempts }` — a map of review-thread IDs to the number of times they have been dispatched to the `fix_code` handler without being resolved.

**Written:** On every `fix_code` dispatch that includes at least one actionable thread.

**Reset:** Automatically cleared (replaced with empty `threadAttempts`) when HEAD SHA changes — a new push means prior fix attempts are no longer relevant.

**Purpose:** Guards against infinite `fix_code` → push → same failure loops for individual threads. See `iterate.fixAttemptsPerThread` in [configuration.md](configuration.md).

### `iterate-stall.json`

**Content:** `{ fingerprint, firstSeenAt }` — a stable fingerprint of the iterate result's material inputs and the Unix timestamp (seconds) when that fingerprint was first seen.

**Written:** On every stall-guarded iterate return (`wait`, `fix_code`, `rerun_ci`, `rebase`) when the fingerprint changes. When the fingerprint matches but the stall threshold has not been exceeded, the file is **not** overwritten (preserving `firstSeenAt`).

**Reset:** When any of the following changes: HEAD SHA, action, status/mergeStateStatus/state/isDraft, failing-check names/kinds, in-progress check names, actionable thread IDs, comment IDs, review IDs, or review-summary IDs. Changes that do not touch these fields (e.g. `remainingSeconds` decrement, `inProgress` count by itself) do **not** reset the timer.

**Purpose:** Guards against infinite loops where the PR is stuck in the same state — for example, a failing test that the agent cannot fix, or a CI run that keeps timing out. After `iterate.stallTimeoutMinutes` (default 30) without material progress, the iterate command escalates with trigger `stall-timeout`.

### `ready-since.txt`

See [ready-delay.md](ready-delay.md) for full lifecycle.

## Atomic write sequence

To prevent partial reads under concurrent access (e.g., a cron tick and a manual `check` running simultaneously):

1. Write data to `<file>.tmp`
2. `rename(<file>.tmp, <file>)` — OS-guaranteed atomic on macOS and Linux

A reader that opens the file between the write and the rename will see the old complete file, never a partial write.

## Multi-process safety

The atomic rename is sufficient for single-machine safety. Multiple shepherd processes on the same machine are safe. Shepherd is not designed for multi-machine deployments — `$TMPDIR` is local to the machine.

## Flags and overrides

| Flag / env var                  | Effect                                                          |
| ------------------------------- | --------------------------------------------------------------- |
| `--no-cache`                    | Bypass read and write for this invocation                       |
| `--cache-ttl <N>`               | Set TTL in seconds (overrides `$PR_SHEPHERD_CACHE_TTL_SECONDS`) |
| `PR_SHEPHERD_CACHE_DIR`         | Replace `$TMPDIR/pr-shepherd-cache` base directory              |
| `PR_SHEPHERD_CACHE_TTL_SECONDS` | Set TTL in seconds (env var override)                           |
