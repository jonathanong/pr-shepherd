# owner/repo stack #40 — actionable

Stack: #40 · anchor PR #403 · 3 layers · mode `summary`
stackMergeable: false
nextAction: shepherd

## Layers

- [PR #401: Human handoff](https://github.com/owner/repo/pull/401) — not shepherded · not mergeable (`mark-ready-authorization-required`)
  - OPEN · draft · position 1/3 · base `main`
- [PR #402: Independent review work](https://github.com/owner/repo/pull/402) — not shepherded · mergeable
  - OPEN · position 2/3 · base `foundation`
- [PR #403: Pending CI](https://github.com/owner/repo/pull/403) — not shepherded · not mergeable (`checks-in-progress`)
  - OPEN · position 3/3 · base `review-work` · 1 in progress

## Instructions

1. Start or delegate the relevant one-PR sessions below; review and CI work on separate layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/owner/repo/pull/402 --until-terminal` for PR #402.
3. Run `pr-shepherd https://github.com/owner/repo/pull/403 --until-terminal` for PR #403.
4. PR #401 requires human action (mark-ready-authorization-required). Keep shepherding other PRs before the handoff.
5. After the listed one-PR sessions, rerun this same `--stack` selector. Stop for the human handoff only when no autonomous shepherding remains.
