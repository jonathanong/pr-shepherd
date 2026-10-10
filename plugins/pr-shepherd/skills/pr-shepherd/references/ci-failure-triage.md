# CI failure triage

Apply when a step says `Playbook: "CI failure triage"`. Use the excerpts and tags already printed; fetch a job log only under the gate-job rule below. An `external` check with a URL may be opened or reproduced.

- A specific `[conclusion: …]` tag wins over the general GitHub Actions rule.
- `[rerun authorized]` with a `rerun:` command means Shepherd verified Actions rerun access (WRITE+) and an original attempt. Run it at most once, even when matrix bullets share its run id. An `[attempt: N]` check never gets another rerun; its excerpt is still investigation work, and without usable evidence it escalates when nothing else remains.
- In-progress runs, `ACTION_REQUIRED`, non-Actions run ids, and runs without attempt metadata never get `[rerun authorized]`.
- `scope: merge_group` never gets a rerun: it cannot restore the queue entry and overwrites the evidence. Fix the PR head if the failure is this PR's. Otherwise apply the Merge queue ejection playbook a printed ejection step names; with no ejection step the entry is still queued, so make no queue mutation and iterate until GitHub reports the removal.
- Do not invent a handoff from `[FIX_CODE]`. Shepherd escalates when nothing autonomous remains.

## Conclusions

- Actions failure with a run id: read the excerpt. Fix a real test or build failure in code and never rerun it, even with `[rerun authorized]`. Run a printed `rerun:` only for a transient cause; without one, finish the other work. Then iterate without waiting.
- An empty excerpt is not evidence of a transient failure. A gate-job excerpt naming failed jobs (for example `test-playwright: failure`) is test-failure evidence even without a stack trace: read the `Other failed jobs in this run` tails first, and only when a named job's tail is absent or truncated run `gh run view <runId> --log-failed -R <owner/repo>`. Rerun only when those logs show a transient cause.
- `CANCELLED` or `STARTUP_FAILURE` (no excerpt): run a printed `rerun:`, else finish the other work; iterate without waiting.
- `ACTION_REQUIRED`: finish the other work and iterate. Shepherd escalates if manual approval is still required.
- `external` with a URL: inspect the provider or reproduce locally, fix, and iterate. The URL alone is not `[ESCALATE]`.
- `(no runId)` without a URL: keep the metadata. Shepherd escalates when nothing else remains.
