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

### `pr-shepherd commit-suggestions [PR] --thread-ids A,B,...`

Agent-side equivalent of GitHub's "Commit suggestion" and "Add suggestion to batch" buttons. Parses reviewer-authored ` ```suggestion ` blocks from the given threads, applies them to their target files, and creates a single remote commit via the `createCommitOnBranch` GraphQL mutation — co-crediting each distinct reviewer. The threads it applies are resolved in the same run.

```sh
pr-shepherd commit-suggestions 42 --thread-ids PRRT_abc,PRRT_def --format=json
```

Requires a clean working tree (the command errors out early if `git status --porcelain` is non-empty). After a successful run **the local checkout is one commit behind remote** — run `git pull --ff-only` before any further local edits. Threads without a parseable suggestion, threads already resolved, or suggestions whose range overlaps another on the same file are reported as `skipped` so the caller can fall back to a manual fix.

The resolve skill surfaces this command automatically for threads that carry a `suggestion` block when `actions.commitSuggestions` is `true` (the default — see [configuration.md](configuration.md)).

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
