# shepherd — debugging

[← README](../README.md)

## Common failure modes

---

### "Loop stuck in WAIT after merge"

**Symptom:** PR was merged but shepherd keeps emitting `action: wait`.

**Cause:** GitHub returns `mergeable: UNKNOWN` and `mergeStateStatus: UNKNOWN` for merged PRs. Before the fix in this repo, shepherd had no branch for `state !== OPEN`, so it fell through to `wait`.

**Fix:** Verify the fix is deployed. Check the iterate output:

```bash
pr-shepherd iterate <PR> --format=json
```

Should return `{"action":"cancel","state":"MERGED",...}`.

If it still returns `wait`, check that `report.mergeStatus.state` is being set correctly in the JSON output.

---

### "Loop stuck in WAIT, status UNKNOWN"

**Symptom:** The loop keeps emitting `action: wait` with `status: UNKNOWN`.

**Cause:** GitHub is still computing the merge state.

**Fix:** Wait a minute and retry:

```bash
pr-shepherd iterate <PR> --format=json
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

**Cause:** Too many API calls. Common when the cache is bypassed frequently or the cron interval is very short.

**Fix options:**

1. Increase `watch.interval` in `.pr-shepherdrc.yml` (e.g. `8m`). The next monitor run will pick it up.
2. Check `x-ratelimit-remaining` in the reporter JSON output to monitor consumption

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
pr-shepherd iterate <PR> --format=json
```

For human-readable output:

```bash
pr-shepherd check <PR>
```
