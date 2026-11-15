# Check follow-up

Apply when a step says `Playbook: "Check follow-up"`. A check failed, was cancelled, or never started, and Shepherd has no rerun or log excerpt to show. Find out why before acting; follow the evidence.

- Logs and jobs: `gh run view <runId> -R <owner/repo> --log-failed`, or the failed job's steps and annotations.
- `STARTUP_FAILURE`: workflow syntax, an unresolved reusable workflow or action, missing permissions, secrets or environments.
- `CANCELLED`: a newer push, a `concurrency` group, a job timeout, a lost runner, or a manual cancel.
- An external check: the provider behind its details URL, and whether it is up. Also check for a GitHub or runner incident.

Then:

1. Cause within this PR: fix it and push.
2. Transient and the run is complete: `gh run rerun <runId> -R <owner/repo>` once. Never rerun a `scope: merge_group` check.
3. Otherwise change nothing and keep your findings. CI configuration, repository settings, and approving a gated run are human decisions. If the checks are unchanged next poll, Shepherd escalates `check-follow-up-unavailable`; report them then.
