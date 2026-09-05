---
title: "Full context over streaming"
description: "One batched poll replaces a tool-call fan-out — and beats CI-only waiters that hide review comments until checks finish."
order: 1
docs:
  - path: "docs/context.md"
    label: "context.md — everything one iterate tick surfaces"
  - path: "docs/graphql.md"
    label: "graphql.md — batch query, pagination, REST supplements"
  - path: "docs/skills.md#recurrence"
    label: "skills.md — why CI-only waiters are the wrong tool"
---

# Full context over streaming

The obvious way to watch a PR is to stream it: poll checks with `gh pr checks`, watch a
run with `gh run watch`, tail logs as they come in. Shepherd doesn't do that, on purpose.

## The real cost of a CI-only waiter

A waiter that only watches checks has a blind spot: it can't see review comments until the
run finishes, because it isn't looking. That's not just slower — it's wasteful. If a
reviewer leaves a comment while CI is still running, a waiter finishes the run, reports
green, and only *then* surfaces the comment. The agent fixes it, pushes, and **retriggers
the whole run** — burning CI minutes on a build that was going to need a second pass
anyway.

Shepherd's own operating instructions put it plainly:

> Do not wait for CI to finish first with `gh pr checks`, `gh pr watch`, `gh run watch`, or
> equivalent GitHub MCP check waiters — fetching check logs is fine, but those waiters only
> see CI and hide review comments until checks finish, which wastes CI when a later review
> fix retriggers the run.

## One batch, not a fan-out

Every `iterate` tick fetches PR state, review threads, comments, reviews, check runs, and
branch protection rules in **one GraphQL batch query**. When a PR needs more than one page
of results, Shepherd pays for a slim, combined-cursor follow-up — not another full
snapshot:

> A PR that needs another page of threads *and* checks pays one follow-up, not two full
> snapshots.

That single batch is also why an agent doesn't need a second GitHub round-trip to act:

> One `iterate` tick surfaces the fields below so the agent does not need a second GitHub
> fan-out to reconstruct PR state.

## `--debounce` batches the tail end, too

This part is specific to the shell poll dispatcher (`pr-shepherd [PR]` /
`--until-terminal`) — MCP `iterate` returns one tick immediately and has no debounce.

Full context isn't just about the read path — it's about not acting on a half-finished
picture. `--debounce` (default 1 minute) gives the poller a settle window after the first
sign of actionable work: if a review comment and a CI failure both land within that
window, it reports them together as one `FIX_CODE`, instead of sending the agent back
twice.

This is also why debounce ticks defer writing "seen" markers until the window closes —
late comments that arrive during the settle window are not marked seen before the
agent-facing result is built, so nothing gets silently swallowed by the batching itself.

## What this buys you

- One `iterate` call replaces the multi-tool fan-out an agent would otherwise perform
  against GitHub MCP, `gh`, and raw GraphQL.
- CI is not retriggered by a review fix that could have been batched with the original
  failure.
- Base-branch protection rules ride along in the same query — no extra round-trip to learn
  what's actually required to merge.
