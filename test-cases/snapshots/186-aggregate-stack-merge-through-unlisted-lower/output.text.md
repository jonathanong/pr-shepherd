# owner/repo stack #61 [ESCALATE] — actionable

anchor PR #611 · 3 layers · mode `summary`
nextAction: escalate

## Layers

- PR #611: Layer 1 — shepherded · mergeable
  - OPEN · base `main`
- PR #612: Layer 2 — shepherded · mergeable
  - OPEN · base `layer-611`
- PR #613: Layer 3 — shepherded · mergeable · owned
  - OPEN · base `layer-612`

## Instructions

1. `unowned-stack-layers`: merging PR #613 also merges #611 ("Layer 1"), #612 ("Layer 2"), which you did not list as yours. Nothing was merged, and never merge only #613 while leaving those layers open. If the user's request already covers those layers (they asked for the whole stack, or for every layer up to #613), run `pr-shepherd stack https://github.com/owner/repo/pull/611 https://github.com/owner/repo/pull/612 https://github.com/owner/repo/pull/613 --until-terminal --merge-through https://github.com/owner/repo/pull/613` now. Otherwise stop and tell the user that merging #613 also merges #611, #612. If they approve, run `pr-shepherd stack https://github.com/owner/repo/pull/611 https://github.com/owner/repo/pull/612 https://github.com/owner/repo/pull/613 --until-terminal --merge-through https://github.com/owner/repo/pull/613` (lists #611, #612 as yours too) or `pr-shepherd stack "owner/repo#61" --until-terminal --merge-through https://github.com/owner/repo/pull/613` (the stack number owns every layer). Otherwise wait for their owners.
