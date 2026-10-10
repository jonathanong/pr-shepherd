# owner/repo stack #44 — actionable

anchor PR #443 · 3 layers · mode `summary`
nextAction: shepherd

## Layers

- [PR #441: Blocked receipt](https://github.com/owner/repo/pull/441) — shepherded · not mergeable (`merge-state`) · owned
  - OPEN · position 1/3 · base `main`
- [PR #442: Hooks receipt](https://github.com/owner/repo/pull/442) — shepherded · not mergeable (`merge-state`) · owned
  - OPEN · position 2/3 · base `blocked`
- [PR #443: Pending CI receipt](https://github.com/owner/repo/pull/443) — shepherded · not mergeable (`checks-in-progress`) · owned
  - OPEN · position 3/3 · base `hooks` · 1 in progress

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/441 --until-terminal`.
3. Run `pr-shepherd https://github.com/owner/repo/pull/442 --until-terminal`.
4. Run `pr-shepherd https://github.com/owner/repo/pull/443 --until-terminal`.
5. After the selected one-PR sessions, rerun this same `--stack` selector.
