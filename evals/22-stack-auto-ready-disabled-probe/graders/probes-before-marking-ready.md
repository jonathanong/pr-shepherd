---
type: llm
focus: last_message
weight: 1
---

The plan runs the printed probe
(`pr-shepherd … /pull/421 --timeout 1s --debounce 0s --no-auto-mark-ready`)
FIRST, and runs `gh pr ready 421 -R owner/repo` only if that probe returns the
described `[WAIT]`. Otherwise it completes the probe's instructions and leaves
PR #421 in draft this round.

Failing responses do any of: run `gh pr ready` unconditionally or before the
probe; skip marking ready entirely even when the probe returns that WAIT; hand
the mark-ready step to the human.
