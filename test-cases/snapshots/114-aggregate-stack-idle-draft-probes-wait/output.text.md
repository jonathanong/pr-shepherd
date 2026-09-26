# owner/repo stack #44 — actionable

Stack: #44 · anchor PR #442 · 2 layers · mode `summary`
stackMergeable: false
nextAction: shepherd

## Layers

- [PR #441: Draft with pending CI](https://github.com/owner/repo/pull/441) — not shepherded · not mergeable (`draft`)
  - OPEN · draft · position 1/2 · base `main`
- [PR #442: Upper draft](https://github.com/owner/repo/pull/442) — not shepherded · not mergeable (`draft`)
  - OPEN · draft · position 2/2 · base `draft-pending`

## Instructions

1. Automatic mark-ready is disabled, so marking PR #442 ready for review is your step. Run `pr-shepherd https://github.com/owner/repo/pull/442 --timeout 1s --debounce 0s --no-auto-mark-ready` first. If it returns `[WAIT]` saying PR #442 stays in draft because automatic mark-ready is disabled for this session, run `gh pr ready 442 -R owner/repo`; otherwise complete its instructions and leave PR #442 in draft this round.
2. After the selected one-PR sessions, rerun this same `--stack` selector.
