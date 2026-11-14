# owner/repo stack #61 [ESCALATE] — actionable

anchor PR #611 · 3 layers · mode `summary`
nextAction: escalate

## Layers

- PR #611: Layer 1 — shepherded · mergeable
  - OPEN · base `main`
- PR #612: Layer 2 — shepherded · mergeable · owned
  - OPEN · base `layer-611`
- PR #613: Layer 3 — shepherded · mergeable · owned
  - OPEN · base `layer-612`

## Instructions

1. `unowned-stack-layers`: merging PR #613 would also land #611, which the caller does not own. Nothing was merged. Stop and tell the user which PRs would be merged. They either approve it, and you rerun `pr-shepherd stack https://github.com/owner/repo/pull/612 https://github.com/owner/repo/pull/613 --until-terminal --merge` with those PRs listed after `stack`, or wait for their owner to finish.
