# owner/repo stack #40 — actionable

anchor PR #403 · 3 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #401: Human handoff — not mergeable (`mark-ready-authorization-required`)
  - OPEN · draft · base `main`
- PR #402: Independent review work — mergeable · owned
  - OPEN · base `foundation`
- PR #403: Pending CI — not mergeable (`checks-in-progress`) · owned
  - OPEN · base `review-work` · 1 in progress

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/402 --until-terminal`.
3. Run `pr-shepherd https://github.com/owner/repo/pull/403 --until-terminal`.
4. PR #401 requires human action (mark-ready-authorization-required). Keep shepherding other PRs before the handoff.
5. After the listed one-PR sessions, rerun this same `--stack` selector. Stop for the human handoff only when no autonomous shepherding remains.
