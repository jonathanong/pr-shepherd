# owner/repo stack #39 — actionable

anchor PR #382 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- [PR #381: Verified foundation](https://github.com/owner/repo/pull/381) — shepherded · mergeable
  - OPEN · position 1/2 · base `main`
- [PR #382: Unverified child](https://github.com/owner/repo/pull/382) — mergeable · owned
  - OPEN · position 2/2 · base `foundation`

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/382 --until-terminal`.
3. After the selected one-PR sessions, rerun this same `--stack` selector.
