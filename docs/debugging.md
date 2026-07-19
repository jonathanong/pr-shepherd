# shepherd — debugging

[← README](../README.md)

## Common failure modes

---

### "Resource not accessible by personal access token"

**Symptom:** Shepherd exits with a `403` or GraphQL error instead of returning an iterate action. The message may include the GraphQL field path that GitHub denied.

**Cause:** The token does not include the target repository, lacks a required fine-grained permission, needs organization approval or SSO authorization, or belongs to a user whose repository role cannot perform the operation.

**Fix:** Compare the token with [the required PAT access](authentication.md). In particular, check `Actions: Read and write` for default cancellation/rerun behavior and `Commit statuses: Read` for third-party status contexts. Fine-grained PATs do not have a separate Checks permission, and the Workflows permission is unrelated to workflow-run access.

Shepherd intentionally does not turn this failure into `wait` or `retry`: incomplete GraphQL read data is not safe input for a PR state transition. Run `pr-shepherd log-file` to locate the request log after correcting access.

---

### "Loop stuck in WAIT after merge"

**Symptom:** PR was merged but shepherd keeps emitting `action: wait`.

**Cause:** GitHub returns `mergeable: UNKNOWN` and `mergeStateStatus: UNKNOWN` for merged PRs. Before the fix in this repo, shepherd had no branch for `state !== OPEN`, so it fell through to `wait`.

**Fix:** Verify the fix is deployed. Check the iterate output:

```bash
pr-shepherd <PR> --format=json
```

Should return `{"action":"cancel","status":"MERGED","state":"MERGED",...}`.

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

### "Rate limit exhaustion"

**Symptom:** Shepherd errors with `API rate limit exceeded` or `secondary rate limit`.

**Cause:** Too many API calls. Common when non-terminal ticks are scheduled too aggressively or many large PRs are being watched at once.

**Fix options:**

1. Pause or cancel the monitor loop if API budget is tight, or increase `poll --interval` / reduce `poll --timeout` for explicit poll sessions.
2. Check rate-limit metadata in JSON output or the per-worktree log.
3. For `resolve` mutate output, retry only the IDs listed under `Not resolved`,
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
