---
type: llm
focus: last_message
weight: 1
---

The plan starts (or delegates) a one-PR `pr-shepherd … --until-terminal` session
for EVERY layer marked `owned` — PR #441, PR #442 and PR #443 — and lets them proceed concurrently.

The output says "Owned layers can proceed concurrently". Stack layers do not wait
on a lower layer's READY receipt, so there is no reason to finish one layer before
starting the next.

Passing responses name a session for each owned layer and run them in parallel,
or delegate them to parallel workers.

Failing responses do any of: drop an owned layer; shepherd only the bottom layer
and defer the rest to "after it merges"; insist the layers must be done strictly
one after another; merge layers by hand instead of shepherding them.
