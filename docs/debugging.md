# shepherd — debugging

[← README](../README.md)

Symptoms, causes, and fixes for common pr-shepherd failures, plus where to find logs and local state. For users and contributors diagnosing a misbehaving loop.

## Where to look

| What                    | Where                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Per-worktree debug log  | `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/worktrees/<basename>-<sha8>.md`; print the path with `pr-shepherd log-file` (or `pr-shepherd admin log-file`)                                 |
| Disable the log         | `PR_SHEPHERD_LOG_DISABLED=1`, or a truthy `CI` (anything but empty, `0`, or `false`)                                                                                                 |
| Logged HTTP body cap    | `PR_SHEPHERD_LOG_MAX_BODY` (default `262144` characters)                                                                                                                             |
| Per-PR state            | `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/<pr>/` — `ready-since.txt`, `ready-receipt.json`, `seen/`, stall and fix-attempt files. List with `pr-shepherd admin clean current --dry-run` |
| State directory default | See [configuration.md](configuration.md#environment-variables)                                                                                                                       |
| API usage per command   | `--verbose` (Markdown `## GitHub API usage`, JSON `apiUsage`)                                                                                                                        |
| Exit codes              | [exit-codes.md](exit-codes.md)                                                                                                                                                       |

## Common failure modes

### "Resource not accessible by personal access token"

**Symptom:** Shepherd exits `77` (`EX_NOPERM`) instead of returning an iterate action (0 or 10–16). Causes:

| Response                                                                                                  | Exit |
| --------------------------------------------------------------------------------------------------------- | ---- |
| HTTP 401/403                                                                                              | 77   |
| GraphQL `errors[].message` matching "resource not accessible" (field-level PAT scope failure, HTTP 200)   | 77   |
| 403 with `Retry-After` or a secondary-rate-limit message; HTTP 200 GraphQL error naming a secondary limit | 75   |
| Any other GraphQL error                                                                                   | 69   |

The message may include the GraphQL field path GitHub denied.

**Cause:** The token does not include the target repository, lacks a required fine-grained permission, needs organization approval or SSO authorization, or belongs to a user whose repository role cannot perform the operation.

**Fix:** Compare the token with [the required PAT access](authentication.md). Check `Actions: Read` for workflow-run, job, and log inspection and `Commit statuses: Read` for third-party status contexts. Fine-grained PATs have no separate Checks permission, and the Workflows permission is unrelated to workflow-run access. After correcting access, run `pr-shepherd admin log-file` to locate the request log.

Shepherd does not turn this into `wait` or a retry: incomplete GraphQL read data is not safe input for a PR state transition.

### "Loop stuck in WAIT after merge"

**Symptom:** The PR merged but Shepherd keeps emitting `action: wait`.

**Cause:** GitHub often returns `mergeable: UNKNOWN` and `mergeStateStatus: UNKNOWN` for merged PRs. Iterate treats `state` as authoritative for terminal PRs; if that short-circuit is skipped, the tick falls through to `wait`.

**Fix:** Check the iterate output:

```bash
pr-shepherd <PR> --format=json
```

A merged PR returns `{"action":"cancel","pr":<N>,"reason":"merged"}` (`--verbose` adds `"status":"MERGED"` and `"state":"MERGED"`). If it still returns `wait`, check that `report.mergeStatus.state` is set correctly in `--verbose` JSON. If it returns `cancel` with a status other than `MERGED` or `CLOSED`, check that `runCheck` short-circuits terminal PRs (`commands/check-terminal-report.mts`) before CI and comment processing.

### "Loop stuck in WAIT, status UNKNOWN"

**Symptom:** The loop keeps emitting `action: wait` with `status: UNKNOWN`.

**Cause:** GitHub is still computing the merge state.

**Fix:** Wait a minute and rerun `pr-shepherd <PR> --format=json`.

### "Loop fires cancel immediately"

**Symptom:** The loop emits `action: cancel` on the first tick, before the ready-delay (default 10 minutes) of READY.

**Cause:** A stale `ready-since.txt` from a previous run is old enough to trigger `shouldCancel`. (A current READY receipt also completes the ready-delay immediately by design; see [actions.md](actions.md).)

**Fix:** From the PR's checkout, list the PR's state files without deleting anything:

```bash
pr-shepherd admin clean current --dry-run
```

Remove the `ready-since.txt` path it prints, for example:

```bash
rm /var/folders/ab/xyz/T/pr-shepherd-state/acme/myrepo/42/ready-since.txt
```

### "First-look items keep coming back during debounce"

**Symptom:** During a `pr-shepherd [PR]` poll, intermediate `FIX_CODE` ticks inside `--debounce` re-surface the same first-look comments.

**Cause:** Debounce ticks run `iterate` with `persistSeen: false`. Seen markers are written only on the post-window tick the agent sees.

**Fix:** None needed; wait for the post-debounce result. MCP `iterate` has no debounce and writes seen markers every tick.

### "Rate limit exhaustion"

**Symptom:** Shepherd errors with `API rate limit exceeded` or `secondary rate limit`.

**Cause:** GitHub keeps separate primary resources, including GraphQL and REST `core`. Exhausting one does not imply the other is exhausted. Which calls use which pool depends on the transport; see [api.md](api.md).

**Fix:**

1. Read the fatal error's resource, remaining/limit, reset time, and credential source. Response headers are authoritative; no extra `/rate_limit` request is needed.
2. Use `--verbose` for command-scoped API usage, or the per-worktree log for every response's quota headers and credential source. See [github-api.md](github-api.md#how-to-read-spend) to tell primary exhaustion from a secondary-limit `Retry-After`, and [graphql.md](graphql.md) or [rest.md](rest.md) for each transport's reads.
3. Follow a `quotaWarning` interval when present. Configure bands with `watch.graphqlQuotaWarnings` (factors of `poll.intervalSeconds`, absolute minutes, or both). The poll dispatcher applies them on `WAIT` / `MARK_READY` sleeps; single-tick `iterate` / MCP only recommend.
4. For quota isolation, use a GitHub App installation access token or a different GitHub user. Same-user PATs share the user's GraphQL pool with GitHub MCP and `gh api graphql` ([authentication.md](authentication.md)).
5. `--until-terminal` keeps polling through an exhausted primary limit until the reset (plus a short margin) and exits `75` only after five attempts that do not move the reset time, writing one stderr line with the resource and reset time. A bounded poll fails with `75` immediately. See [github-api.md](github-api.md#rate-limit-backoff).
6. For `apply review` output, retry only the IDs listed under `Not replied`, `Not resolved`, `Not minimized`, or `Not dismissed` (`due to rate limit`); IDs listed as completed already succeeded.

### "GraphQL UNKNOWN for mergeable — persists after retry"

**Symptom:** The REST fallback (`getMergeableState`) also returns UNKNOWN.

**Cause:** Normal for OPEN PRs while GitHub computes merge state; usually resolves within 30 seconds.

**Diagnosis:**

```bash
gh api repos/OWNER/REPO/pulls/PR --jq '{state,mergeable,mergeable_state}'
```

If `state` is `open`, `mergeable` is `null`, and `mergeable_state` stays `unknown` for several minutes, GitHub may have a backend issue.

## Replay an iteration manually

| Output             | Command                          |
| ------------------ | -------------------------------- |
| JSON               | `pr-shepherd <PR> --format=json` |
| Markdown, one tick | `pr-shepherd iterate <PR>`       |
