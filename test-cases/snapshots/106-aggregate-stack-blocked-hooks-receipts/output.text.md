# owner/repo stack #44 — actionable

anchor PR #443 · 3 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #441: Blocked receipt — shepherded · not mergeable (`merge-state`) · owned
  - OPEN · base `main`
- PR #442: Hooks receipt — shepherded · not mergeable (`merge-state`) · owned
  - OPEN · base `blocked`
- PR #443: Pending CI receipt — shepherded · not mergeable (`checks-in-progress`) · owned
  - OPEN · base `hooks` · 1 in progress

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/441 --until-terminal`.
3. Run `pr-shepherd https://github.com/owner/repo/pull/442 --until-terminal`.
4. Run `pr-shepherd https://github.com/owner/repo/pull/443 --until-terminal`.
5. After the selected one-PR sessions, rerun this same `--stack` selector.
