# owner/repo stack #45 — actionable

anchor PR #452 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #451: Layer needing a decision — not mergeable (`fix-thrash`) · owned
  - OPEN · base `main`
- PR #452: Held upper draft — not mergeable (`draft`) · owned
  - OPEN · draft · base `needs-decision`

## Instructions

1. Automatic mark-ready is disabled, so marking PR #452 ready for review is your step. Run `pr-shepherd https://github.com/owner/repo/pull/452 --timeout 1s --debounce 0s --no-auto-mark-ready` first. If it returns `[WAIT]` saying PR #452 stays in draft because automatic mark-ready is disabled for this session, run `gh pr ready 452 -R owner/repo`; otherwise complete its instructions and leave PR #452 in draft this round.
2. PR #451 requires human action (fix-thrash). Keep shepherding other PRs before the handoff.
3. After the listed one-PR sessions, rerun this same `--stack` selector. Stop for the human handoff only when no autonomous shepherding remains.
