# Required checks unreported

Apply when a step says `Playbook: "Required checks unreported"`. The merge target requires checks that have no run on this head, and nothing is running. Shepherd cannot tell from GitHub's data why nothing started, so find out before acting. The places below are starting points, not a checklist; follow the evidence wherever it leads.

- Workflow triggers and `paths`, `paths-ignore`, or branch filters, compared with this PR's changed files and base branch.
- Whether each required name matches a check that any workflow or app actually emits.
- Whether Actions is enabled, and whether a run is waiting on approval or a runner.
- Whether the PR targets the branch the rules expect, for example a stack layer's parent versus trunk.
- Whether the app that posts an external context is installed.
- Whether GitHub reports an incident.

Then act on what you found:

1. If the cause is within this PR (wrong base or stack parent, a changed file that breaks the workflow, configuration the PR should carry), fix it and push.
2. If the workflows should have run and the PR is fine, run the printed close and reopen commands once for this head. Do not close it again.
3. Otherwise investigate first. If you are still unsure of the cause, or it is outside this PR, make no change and keep what you found. Changing CI configuration, repository settings, or branch rules is a human decision. If the checks are still missing on the next poll, Shepherd escalates with `required-checks-unreported`; report your diagnosis then.
