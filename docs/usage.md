# pr-shepherd CLI usage

[← README](../README.md)

## Commands

### `pr-shepherd check [PR]`

Read-only PR status snapshot. Fetches CI + comments + merge status in one GraphQL request.

```sh
pr-shepherd check          # infers PR from current branch
pr-shepherd check 42       # explicit PR number
pr-shepherd check 42 --format=json
pr-shepherd check 42 --no-cache
```

**Exit codes:** 0=READY, 1=FAILING/PENDING/UNKNOWN, 2=IN_PROGRESS, 3=UNRESOLVED_COMMENTS

### `pr-shepherd resolve [PR]`

Two modes:

**Fetch mode** (no mutation flags — auto-resolves outdated threads and returns actionable items):

```sh
pr-shepherd resolve         # fetch mode
pr-shepherd resolve 42 --fetch --format=json
```

**Mutation mode** (after pushing fixes):

```sh
pr-shepherd resolve 42 \
  --resolve-thread-ids RT_abc,RT_def \
  --minimize-comment-ids IC_xyz \
  --dismiss-review-ids PRR_123 \
  --message "Switched query to parameterized form in src/db.ts" \
  --require-sha $(git rev-parse HEAD)
```

`--require-sha` polls GitHub until the PR head matches the SHA before mutating — prevents resolving before reviewers see the fix. `--message` is required only when `--dismiss-review-ids` is set, and should describe the specific fix — it is shown to the reviewer on GitHub.

### `pr-shepherd commit-suggestion [PR] --thread-id A --message "…"`

Applies a single reviewer ` ```suggestion ` block as a local git commit. Builds a unified diff from the suggestion, validates it against the working tree with `git apply --check`, writes the file, and commits with the caller-supplied message plus a `Co-authored-by: <reviewer>` trailer. The thread is resolved on GitHub after the commit lands. One command = one thread = one local commit. The CLI never pushes.

```sh
pr-shepherd commit-suggestion 42 \
  --thread-id PRRT_abc \
  --message "trim trailing whitespace per reviewer" \
  --format=json
```

Requires a clean working tree and that the current branch matches the PR head ref. Every validation failure is a hard error. The resolve skill calls this automatically for threads that carry a `suggestion` block when `actions.commitSuggestions` is `true` (the default — see [configuration.md](configuration.md)).

### `pr-shepherd iterate [PR]`

Used by the cron loop. Returns compact JSON action, consumed by the monitor skill. See [iterate-flow.md](iterate-flow.md) for the full dispatch logic.

```sh
pr-shepherd iterate 42 \
  --no-cache \
  --ready-delay 10m \
  --last-push-time "$(git log -1 --format=%ct HEAD)" \
  --format=json
```

### `pr-shepherd status [PR1 PR2 …]`

Multi-PR summary table.

```sh
pr-shepherd status 41 42 43
```

## Common flags

| Flag                  | Default | Description                                       |
| --------------------- | ------- | ------------------------------------------------- |
| `--format text\|json` | `text`  | Output format                                     |
| `--no-cache`          | false   | Bypass the 5-minute file cache                    |
| `--cache-ttl N`       | 300     | Cache TTL in seconds                              |
| `--ready-delay Nm`    | `10m`   | Settle window before the loop cancels after READY |

## Manual iteration

You can run a single iterate manually without the loop:

```sh
pr-shepherd iterate 42 --no-cache --format=json \
  --last-push-time "$(git log -1 --format=%ct HEAD)"
```

Useful for debugging why a loop is stuck.
