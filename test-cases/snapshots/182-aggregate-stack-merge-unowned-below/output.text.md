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

1. `unowned-stack-layers`: merging PR #613 also merges #611 ("Layer 1"), which you did not list as yours. Nothing was merged, and never merge only #613 while leaving that layer open. If the user's request already covers that layer (they asked for the whole stack, or for every layer up to #613), run `pr-shepherd stack https://github.com/owner/repo/pull/611 https://github.com/owner/repo/pull/612 https://github.com/owner/repo/pull/613 --until-terminal --merge` now. Otherwise stop and tell the user that merging #613 also merges #611. If they approve, run that same command, or `pr-shepherd stack "owner/repo#61" --until-terminal --merge` (the stack number owns every layer). Otherwise wait for its owner.
