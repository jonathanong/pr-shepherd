# vouchington/vouchington stack #2622 — actionable

anchor PR #2621 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- [PR #2620: ci(filters): require path filters to cover executed scripts](https://github.com/vouchington/vouchington/pull/2620) — not mergeable (`review-work`) · owned
  - OPEN · position 1/2 · base `main` · 3 actionable
- [PR #2621: fix(ci): make run-bounded own the command's output pipes](https://github.com/vouchington/vouchington/pull/2621) — shepherded · mergeable · owned
  - OPEN · position 2/2 · base `ci/executed-script-path-coverage`

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/vouchington/vouchington/pull/2620 --until-terminal`.
3. After the selected one-PR sessions, rerun this same `--stack` selector.
