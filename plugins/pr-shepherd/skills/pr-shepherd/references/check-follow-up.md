# Check follow-up

Apply when a step says `Playbook: "Check follow-up"`. A check failed, was cancelled, or never started, and Shepherd has no rerun to offer. Start from any excerpt or annotations it printed; without them, find out why before acting. Follow the evidence.

- The run: `gh run view <runId> -R <owner/repo>` lists its jobs and annotations, which often say why a job never got a runner; add `--log-failed` for logs.
- `STARTUP_FAILURE`: workflow syntax, an unresolved reusable workflow or action, missing permissions, secrets or environments.
- `CANCELLED`: a newer push, a `concurrency` group, a job timeout, a lost runner, or a manual cancel.
- An external check: the provider behind its details URL, and whether it is up. Also check for a GitHub or runner incident.

Then:

1. Cause within this PR: fix it and push.
2. Transient and the output printed a rerun command for it: run that command. Without one, do not rerun; the allowance is spent or the check is not rerunnable.
3. Otherwise investigate first, including the check's details URL. If you are still unsure of the cause, or it is outside this PR (CI configuration, repository settings, approving a gated run), change nothing, rerun Shepherd so it escalates `check-follow-up-unavailable` if the checks are unchanged, and report your findings.
