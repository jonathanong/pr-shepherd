# vouchington/vouchington stack #2622 — actionable

Stack: #2622 · anchor PR #2621 · 2 layers · mode `summary`
stackMergeable: false
nextAction: shepherd

## Layers

- [PR #2620: ci(filters): require path filters to cover executed scripts](https://github.com/vouchington/vouchington/pull/2620) — not shepherded · not mergeable (`review-work`) · owned
  - OPEN · position 1/2 · base `main` · 3 actionable
- [PR #2621: fix(ci): make run-bounded own the command's output pipes](https://github.com/vouchington/vouchington/pull/2621) — shepherded · mergeable · owned
  - OPEN · position 2/2 · base `ci/executed-script-path-coverage`

## Instructions

1. Start or delegate one-PR sessions only for rows marked `owned`. Leave every other author's layer untouched. Owned layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/vouchington/vouchington/pull/2620 --until-terminal` for PR #2620.
3. After the selected one-PR sessions, rerun this same `--stack` selector.
