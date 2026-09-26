# owner/repo stack #31 — actionable

Stack: #31 · anchor PR #302 · 2 layers · mode `summary`
stackMergeable: false
nextAction: shepherd

## Layers

- [PR #301: Draft foundation](https://github.com/owner/repo/pull/301) — not shepherded · not mergeable (`draft`) · owned
  - OPEN · draft · position 1/2 · base `main`
- [PR #302: Ready-looking child](https://github.com/owner/repo/pull/302) — shepherded · mergeable
  - OPEN · position 2/2 · base `foundation`

## Instructions

1. Start or delegate one-PR sessions only for rows marked `owned`. Leave every other author's layer untouched. Owned layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/owner/repo/pull/301 --until-terminal` for PR #301.
3. After the selected one-PR sessions, rerun this same `--stack` selector.
