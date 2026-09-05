---
title: "Deterministic orchestration, agentic judgment"
description: "A split, not a hierarchy: Shepherd decides the next state deterministically; the agent decides what the state means."
order: 2
docs:
  - path: "docs/iterate-flow.md"
    label: "iterate-flow.md — the dispatch order, as a decision table"
  - path: "docs/escalations.md"
    label: "escalations.md — the finite escalation trigger list"
  - path: "docs/comparison.md"
    label: "comparison.md — where pr-shepherd sits next to review bots and hosted agents"
---

# Deterministic orchestration, agentic judgment

It would be easy to read "deterministic" as a claim that Shepherd is smarter than an
agent, or a rebuttal to agentic tools generally. It isn't either. It's a division of
labor: **Shepherd owns the state transition, the agent owns the judgment call.**

> The agent still decides whether a comment or CI failure needs a code change. Shepherd
> does not classify signal vs noise and does not mutate git.

## What "deterministic" actually means here

Not a vibe — a checkable property. Given the same complete input — the PR snapshot *and*
local state (seen markers, the ready-delay timer, stall and fix-attempt tracking) *and*
the current time — `iterate` always produces the same action, because the dispatch order
is a fixed sequence of conditions, evaluated first-match-wins. An unchanged PR snapshot
can still move to a different action as any of those other inputs change: a ready-delay
timer elapsing turns `WAIT` into `CANCEL` or `MERGE`, a first-look item becomes seen, and
accumulated stall or fix-attempt state can turn a repeat `FIX_CODE` into `ESCALATE`. None
of that is nondeterminism — it's the same fixed table over a larger, and equally
inspectable, input.

1. Sweep and check terminal state (merged/closed → `cancel`).
2. Ready-delay bookkeeping for a clean, ready PR.
3. Actionable work — any of eleven specific conditions (open threads, failing checks,
   conflicts, pending review summaries, and so on).
4. Mark ready, if the PR is a clean draft.
5. An active auto-merge or queue entry → `wait`.
6. Fallthrough → `wait`.

That table is exhaustive and published — see `iterate-flow.md` in the canonical spec
below. So is the escalation list: `ESCALATE` fires on a *finite*, named set of seven
triggers — for example a stall timeout, a thread stuck past its fix-attempt budget, a
check with no autonomous follow-up, or an unexplained merge-queue removal — not on a
fuzzy "this seems stuck" model. The full seven are enumerated in `escalations.md` below.

## Where judgment stays with the agent

Shepherd hands back raw, structured context — review thread bodies, failing check names,
job logs, merge requirements — and stops there. It never resolves the actual question of
whether a comment is a nit or a blocker, or whether a failure needs a code fix or a rerun:

> Does not auto-classify every surfaced thread/comment as `actionable` vs `informational`;
> it exposes raw structured triage data.

The same restraint applies to git. Shepherd computes what should happen next; it never
performs the mutation that gets you there:

> The CLI never performs git mutations itself — it only emits commit/push instructions for
> the agent to run.

## Why the split, not one or the other

An agent re-deriving "what state is this PR in" from raw GitHub data every tick is doing
work a state machine does better: same inputs, same output, every time, with a decision
table you can read end to end. An agent *guessing* whether a comment needs a code change
is doing work a state machine does worse: that call depends on the code, the comment's
intent, and context no fixed rule can capture.

Deterministic orchestration removes the first kind of work so the agent's judgment is
spent entirely on the second kind — which is the only kind that actually needed it.
