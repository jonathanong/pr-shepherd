# owner/repo stack #31 — actionable

anchor PR #302 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- [PR #301: Draft foundation](https://github.com/owner/repo/pull/301) — not mergeable (`draft`) · owned
  - OPEN · draft · position 1/2 · base `main`
- [PR #302: Ready-looking child](https://github.com/owner/repo/pull/302) — shepherded · mergeable
  - OPEN · position 2/2 · base `foundation`

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/301 --until-terminal`.
3. After the selected one-PR sessions, rerun this same `--stack` selector.
