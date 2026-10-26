# owner/repo stack #32 — actionable

anchor PR #312 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #311: Conflicting foundation — not mergeable (`conflicting`) · owned
  - OPEN · base `main`
- PR #312: Verified child — shepherded · mergeable
  - OPEN · base `foundation`

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/311 --until-terminal`.
3. After the selected one-PR sessions, rerun `pr-shepherd stack https://github.com/owner/repo/pull/312 --until-terminal --ready-delay 0s --stall-timeout 3600s`. Do not end the turn while any layer is non-terminal: a one-PR session returning `CANCEL` or `ESCALATE` finishes only that layer, and merged, `CANCEL`, `ESCALATE`, or handed-off layers do not count.
