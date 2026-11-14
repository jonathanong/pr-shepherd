# owner/repo stack #60 — actionable

anchor PR #601 · 3 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #601: Layer 1 — shepherded · mergeable
  - OPEN · base `main`
- PR #602: Layer 2 — shepherded · mergeable
  - OPEN · base `layer-601`
- PR #603: Layer 3 — mergeable
  - OPEN · base `layer-602`

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/603 --until-terminal`.
3. After the selected one-PR sessions, rerun `pr-shepherd stack https://github.com/owner/repo/pull/601 --until-terminal --merge`. Keep watching until every layer is terminal.
4. Owned layers #601, #602 are ready, but #603 (action triage; reasons review-work) is not. Nothing was merged because `--merge` lands every layer in scope together. Tell the user the lower layers are ready. Only if the user asked to merge layers as they become ready, rerun `pr-shepherd stack https://github.com/owner/repo/pull/601 --until-terminal --merge-ready`; otherwise keep shepherding.
