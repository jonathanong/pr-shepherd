---
type: llm
focus: last_message
weight: 1
---

The plan follows the printed `[WAIT]` instructions: it ends the turn without
sleeping or polling, and commits to rerunning the same pr-shepherd command with
the same options when a PR event or the printed wake-up arrives.

Ending the turn as printed is CORRECT, and so is keeping one wake-up at the
printed time. Saying the host has no scheduler is fine.

Failing responses do any of: rerun in a tight loop or sleep in the same turn;
present the PR as finished; ask the user whether to continue or what to do;
never say they will rerun pr-shepherd.
