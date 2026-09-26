# owner/repo stack #39 — actionable

Stack: #39 · anchor PR #382 · 2 layers · mode `summary`
stackMergeable: false
nextAction: shepherd

## Layers

- [PR #381: Verified foundation](https://github.com/owner/repo/pull/381) — shepherded · mergeable
  - OPEN · position 1/2 · base `main`
- [PR #382: Unverified child](https://github.com/owner/repo/pull/382) — not shepherded · mergeable · owned
  - OPEN · position 2/2 · base `foundation`

## Instructions

1. Start or delegate one-PR sessions only for rows marked `owned`. Leave every other author's layer untouched. Owned layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/owner/repo/pull/382 --until-terminal` for PR #382.
3. After the selected one-PR sessions, rerun this same `--stack` selector.
