# shepherd — debugging

[← README](../README.md)

## Common failure modes

---

### "Resource not accessible by personal access token"

**Symptom:** Shepherd exits `77` (`EX_NOPERM`) instead of returning an iterate action (0/10–14). This happens for an HTTP 401/403, or for a GraphQL response whose `errors[].message` matches "resource not accessible" — GitHub reports some field-level PAT scope failures this way at HTTP 200. Not every GraphQL error means `77`: a 403 carrying `Retry-After` (GitHub's secondary rate limit) exits `75` instead, and an unrelated GraphQL error exits `69`. The message may include the GraphQL field path that GitHub denied. See [exit-codes.md](exit-codes.md) for the full code table.

**Cause:** The token does not include the target repository, lacks a required fine-grained permission, needs organization approval or SSO authorization, or belongs to a user whose repository role cannot perform the operation.

**Fix:** Compare the token with [the required PAT access](authentication.md). In particular, check `Actions: Read` for workflow-run, job, and log inspection and `Commit statuses: Read` for third-party status contexts. Fine-grained PATs do not have a separate Checks permission, and the Workflows permission is unrelated to workflow-run access.

Shepherd intentionally does not turn this failure into `wait` or `retry`: incomplete GraphQL read data is not safe input for a PR state transition. Run `pr-shepherd admin log-file` to locate the request log after correcting access.

---

### "Loop stuck in WAIT after merge"

**Symptom:** PR was merged but shepherd keeps emitting `action: wait`.

**Cause:** GitHub often returns `mergeable: UNKNOWN` and `mergeStateStatus: UNKNOWN` for merged PRs. Iterate treats `state` as authoritative for terminal PRs; if that short-circuit is skipped, the tick can fall through to `wait`.

**Fix:** Check the iterate output:

```bash
pr-shepherd <PR> --format=json
```

A merged PR should return `{"action":"cancel","status":"MERGED","state":"MERGED",...}`.

If it still returns `wait`, check that `report.mergeStatus.state` is being set correctly in the JSON output. If it returns `cancel` but the status is not `MERGED` or `CLOSED`, check that `runCheck` is short-circuiting terminal PRs before CI/comment processing.

---

### "Loop stuck in WAIT, status UNKNOWN"

**Symptom:** The loop keeps emitting `action: wait` with `status: UNKNOWN`.

**Cause:** GitHub is still computing the merge state.

**Fix:** Wait a minute and retry:

```bash
pr-shepherd <PR> --format=json
```

---

### "Loop fires cancel immediately"

**Symptom:** The loop emits `action: cancel` on the very first tick, before 10 minutes of READY.

**Cause:** A stale `ready-since.txt` from a previous run. The timestamp is old enough to trigger `shouldCancel`.

**Fix:** Delete the ready-since file:

```bash
rm $TMPDIR/pr-shepherd-state/<owner>-<repo>/<pr>/ready-since.txt
```

Replace `<owner>-<repo>` and `<pr>` with actual values. Example:

```bash
rm $TMPDIR/pr-shepherd-state/acme-myrepo/42/ready-since.txt
```

---

### "First-look items keep coming back during debounce"

**Symptom:** During `pr-shepherd [PR]` poll, intermediate `FIX_CODE` ticks inside `--debounce` seem to re-surface the same first-look comments.

**Cause:** Debounce ticks run `iterate` with `persistSeen: false`. Seen markers are written only on the post-window tick that the agent actually sees.

**Fix:** Expected. Wait for the poll to return the post-debounce result. MCP `iterate` has no debounce and writes seen markers each tick.

---

### "Rate limit exhaustion"

**Symptom:** Shepherd errors with `API rate limit exceeded` or `secondary rate limit`.

**Cause:** GitHub maintains separate primary resources, including GraphQL and REST `core`. Shepherd's normal PR snapshot is GraphQL; Actions jobs/logs and the mergeability fallback are the permitted REST paths. Exhausting one resource does not imply that the other is exhausted.

**Fix options:**

1. Read the fatal error's resource, remaining/limit, reset time, and credential source. Response headers are authoritative; no extra `/rate_limit` request is needed.
2. Use `--verbose` for command-scoped API usage, or inspect the per-worktree log for every response's quota headers and credential source.
3. Follow a `quotaWarning` interval when present. Configure the bands with `watch.graphqlQuotaWarnings`; Shepherd recommends but does not automatically change polling.
4. Pause the monitor loop if the resource is exhausted.
5. For `resolve` mutate output, retry only the IDs listed under `Not resolved`,
   `Not minimized`, or `Not dismissed`; IDs listed as completed already succeeded.

---

### "GraphQL UNKNOWN for mergeable — persists after retry"

**Symptom:** The REST fallback (`getMergeableState`) also returns UNKNOWN.

**Cause:** Normal for OPEN PRs while GitHub is computing merge state. Usually resolves within 30 seconds.

**Diagnosis:**

```bash
gh pr view <PR> --json state,mergeable,mergeStateStatus
```

If `state` is `OPEN` and both `mergeable` and `mergeStateStatus` are `UNKNOWN` after several minutes, there may be a GitHub backend issue.

---

## Replay an iteration manually

To replay a single iteration with full output:

```bash
pr-shepherd <PR> --format=json
```

For human-readable output:

```bash
pr-shepherd iterate <PR>
```
