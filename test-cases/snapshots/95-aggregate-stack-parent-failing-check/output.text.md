# owner/repo stack #33 — actionable

anchor PR #322 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- [PR #321: CI failure](https://github.com/owner/repo/pull/321) — not mergeable (`failing-checks`) · owned
  - OPEN · position 1/2 · base `main` · 1 failing
- [PR #322: Verified child](https://github.com/owner/repo/pull/322) — shepherded · mergeable
  - OPEN · position 2/2 · base `foundation`

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/321 --until-terminal`.
3. After the selected one-PR sessions, rerun this same `--stack` selector.
