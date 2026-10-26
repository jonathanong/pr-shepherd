# owner/repo stack #43 — actionable

anchor PR #431 · 1 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #431: Draft CI failure — not mergeable (`draft`) · owned
  - OPEN · draft · base `main`

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/431 --timeout 1s --debounce 0s --no-auto-mark-ready`.
3. After the selected one-PR sessions, rerun `pr-shepherd stack https://github.com/owner/repo/pull/431 --until-terminal --ready-delay 0s --stall-timeout 3600s --no-auto-mark-ready`. Do not end the turn while any layer is non-terminal: a one-PR session returning `CANCEL` or `ESCALATE` finishes only that layer, and merged, `CANCEL`, `ESCALATE`, or handed-off layers do not count.
