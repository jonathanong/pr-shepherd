# Check follow-up

Apply when a step says `Playbook: "Check follow-up"`. A check failed (or was cancelled, or never started) and Shepherd has neither a rerun it can offer nor a log excerpt it can show, so it cannot tell from GitHub's data why. Find out before acting. The places below are starting points, not a checklist; follow the evidence wherever it leads.

- The run's own logs and jobs: `gh run view <runId> -R <owner/repo> --log-failed`, or the failed job's steps and annotations.
- For `STARTUP_FAILURE`, whether the workflow file is valid and what changed in it: syntax, a reusable workflow or action reference that no longer resolves, permissions, secrets or environments the run needs.
- For `CANCELLED`, what cancelled it: a newer push, a `concurrency` group, a job timeout, a lost runner, or someone cancelling by hand.
- For a later attempt, how it differs from the first one and whether the cause is still in this PR.
- For an external check, the provider behind its details URL, and whether the provider is up.
- Whether GitHub or the runner pool reports an incident.

Then act on what you found:

1. If the cause is within this PR (a broken workflow or step, code, configuration the PR should carry), fix it and push.
2. If the failure was transient and the run is complete, rerun it once: `gh run rerun <runId> -R <owner/repo>`. Never rerun a `scope: merge_group` check; apply the Merge queue ejection playbook if a printed step names it.
3. Otherwise make no change and keep what you found. Changing CI configuration, repository settings, or approving a gated run is a human decision. If the same checks are unchanged on the next poll, Shepherd escalates with `check-follow-up-unavailable`; report your diagnosis then.
