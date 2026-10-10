# Create a PR

Apply when the user asks to make, create, or open a PR, before dispatching.

- Review and commit the in-scope changes, verify the push remote and base branch, push a fresh branch, create the PR, and pass its qualified URL to Dispatch.
- Push is the ordinary non-force push of those reviewed commits. Do not ask for a separate confirmation because the push publishes them. Request runtime escalation when the host requires it.
- A skill cannot grant host permissions. Unattended approval comes from a trusted command rule or host policy.
- Rebasing your own PR head onto its base and pushing it with `--force-with-lease` is also part of this workflow. Do not ask first.
- Bare `--force`, pushes to any other branch, remote or credential changes, unrelated changes, and ambiguous targets stay outside this workflow.
- Creating or opening a PR without merge intent leaves `--merge` off.
