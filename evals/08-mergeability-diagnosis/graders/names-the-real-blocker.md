---
type: llm
focus: last_message
weight: 1
---

The response identifies the PR-level changes-requested review from @architect
(`PRR_prlevel`) as what is holding this PR up.

Passing responses name that review as the blocker and address its substance (the
architecture concern) — optionally noting that merge is `CLEAN`, approvals are
not required, and conversations are already resolved.

Failing responses do any of: claim the PR needs an approval, a reviewer sign-off,
or "an approver" before it can merge; report it as blocked on required
conversation resolution; say CI is the blocker; state that nothing is blocking
it.
