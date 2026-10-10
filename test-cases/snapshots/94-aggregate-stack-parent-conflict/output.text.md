# owner/repo stack #32 — actionable

anchor PR #312 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- [PR #311: Conflicting foundation](https://github.com/owner/repo/pull/311) — not mergeable (`conflicting`) · owned
  - OPEN · position 1/2 · base `main`
- [PR #312: Verified child](https://github.com/owner/repo/pull/312) — shepherded · mergeable
  - OPEN · position 2/2 · base `foundation`

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/311 --until-terminal`.
3. After the selected one-PR sessions, rerun this same `--stack` selector.
