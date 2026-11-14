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
2. Run `pr-shepherd https://github.com/owner/repo/pull/402 --until-terminal --layers 401:1:u:foundation,402:2:o:review-work,403:3:o:pending-ci`.
3. Run `pr-shepherd https://github.com/owner/repo/pull/403 --until-terminal --layers 401:1:u:foundation,402:2:o:review-work,403:3:o:pending-ci`.
4. PR #401 requires human action (mark-ready-authorization-required). Keep shepherding other PRs before the handoff.
5. Branch updates: unowned layer #401 sits in this stack and must not be rebased or pushed. A `gh stack rebase` or `gh stack push` printed by a one-PR session covers the whole stack, so do not run it as printed. No owned layer sits below the first unowned layer (#401), so no owned branch can be restacked without rewriting it. Do not rebase or push; report that the owned layers wait on #401's owner.
6. After the listed one-PR sessions, rerun `pr-shepherd stack https://github.com/owner/repo/pull/402 https://github.com/owner/repo/pull/403 --until-terminal`. Stop for the human handoff only when no autonomous shepherding remains.
