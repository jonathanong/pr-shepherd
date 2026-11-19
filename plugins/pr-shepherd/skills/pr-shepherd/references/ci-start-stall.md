# CI start stall

Apply when a step says `Playbook: "CI start stall"`. One or more checks were created on this head, have been waiting longer than the stall timeout, and never started. Shepherd cannot tell from GitHub's data why. Find out before acting. The places below are starting points, not a checklist; follow the evidence wherever it leads.

- Whether a runner is available for the job's `runs-on` labels, and whether the run is queued behind a `concurrency` group or a concurrency limit.
- Whether the run is waiting on a deployment-environment approval or a required reviewer.
- Whether Actions is enabled and not out of minutes or spending limit.
- For an external status context, whether the app that posts it is installed and reachable.
- Whether GitHub reports an incident.

Then act on what you found:

1. If the cause is within this PR (a `runs-on` label that matches no runner, a workflow change that breaks scheduling, a wrong base), fix it and push.
2. If a run is only waiting on an approval you can legitimately grant, grant it. An approval that needs a human reviewer is not yours to grant.
3. Otherwise investigate first. If you are still unsure of the cause, or it is outside this PR, make no change and keep what you found. Runner capacity, billing, repository settings, and GitHub incidents are human decisions. If the same checks are still not started on the next poll, Shepherd escalates with `stall-timeout`; report your diagnosis then.
