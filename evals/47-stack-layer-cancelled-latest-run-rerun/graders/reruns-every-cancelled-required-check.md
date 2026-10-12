---
type: llm
focus: last_message
weight: 1
---

The plan runs all three printed `rerun:` commands — `gh run rerun 200`,
`gh run rerun 201` and `gh run rerun 202` (each with `-R vouchington/vouchington`)
— once each, and then iterates without waiting for CI.

The output lists `static`, `web` and `gitleaks` under `## Failing checks`
with `[conclusion: CANCELLED]` and a printed `rerun:` command, and the status
is `FAILING` with merge state `BLOCKED`. A cancelled check is rerun.

Failing responses do any of: call CI green, passing or ready because the summary
says "3 passing"; skip any of the three reruns; merge or enqueue the PR; push an
empty commit or rebase to retrigger CI instead of rerunning; edit code; wait or
watch (`gh run watch`, `gh pr checks --watch`) for the reruns; escalate or
hand the cancellations to the user.
