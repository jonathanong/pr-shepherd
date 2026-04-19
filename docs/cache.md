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
