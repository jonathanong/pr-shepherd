# owner/repo stack #62 [ESCALATE] — actionable

anchor PR #621 · 3 layers · mode `summary`
nextAction: escalate

## Layers

- PR #621: Layer 1 — shepherded · mergeable
  - OPEN · base `main`
- PR #622: Layer 2 — shepherded · mergeable
  - OPEN · base `layer-621`
- PR #623: Layer 3 — shepherded · mergeable
  - OPEN · base `layer-622`

Layers added after approval: #623

## Instructions

1. `unapproved-stack-layer`: PR #623 joined this stack after the merge was requested, so the request does not cover it. Nothing was merged. Stop and ask the user whether that layer is covered. If yes, rerun `pr-shepherd stack "owner/repo#62" --until-terminal --merge` with the covered PRs listed explicitly after `stack`. If no, rerun with `--merge-through 622`, the last approved PR.
