# owner/repo stack #32 — actionable

Stack: #32 · anchor PR #312 · 2 layers · mode `summary`
stackMergeable: false
nextAction: shepherd

## Layers

- [PR #311: Conflicting foundation](https://github.com/owner/repo/pull/311) — not shepherded · not mergeable (`conflicting`) · owned
  - OPEN · position 1/2 · base `main`
- [PR #312: Verified child](https://github.com/owner/repo/pull/312) — shepherded · mergeable
  - OPEN · position 2/2 · base `foundation`

## Instructions

1. Start or delegate one-PR sessions only for rows marked `owned`. Leave every other author's layer untouched. Owned layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/owner/repo/pull/311 --until-terminal` for PR #311.
3. After the selected one-PR sessions, rerun this same `--stack` selector.
