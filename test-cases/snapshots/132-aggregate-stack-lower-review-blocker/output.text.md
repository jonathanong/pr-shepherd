# vouchington/vouchington stack #2622 — actionable

anchor PR #2621 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #2620: ci(filters): require path filters to cover executed scripts — not mergeable (`review-work`) · owned
  - OPEN · base `main` · 3 actionable
- PR #2621: fix(ci): make run-bounded own the command's output pipes — shepherded · mergeable · owned
  - OPEN · base `ci/executed-script-path-coverage`

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/vouchington/vouchington/pull/2620 --until-terminal`.
3. After the selected one-PR sessions, rerun `pr-shepherd stack https://github.com/vouchington/vouchington/pull/2621 --until-terminal --merge --ready-delay 0s --stall-timeout 3600s`. Do not end the turn while any layer is non-terminal: a one-PR session returning `CANCEL` or `ESCALATE` finishes only that layer, and merged, `CANCEL`, `ESCALATE`, or handed-off layers do not count.
