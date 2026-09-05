---
title: "Surface data, don't classify it"
description: "Ship the raw field, not a one-liner enum over it — unless removing the enum would cost the agent a second tool call."
order: 3
docs:
  - path: "CLAUDE.md#surface-data-dont-classify-it"
    label: "CLAUDE.md — the principle as enforced on this codebase"
  - path: "docs/features.md"
    label: "features.md — the 'not supported' list this principle produces"
  - path: "docs/checks.md"
    label: "checks.md — raw CI classification: category, failedStep, jobName, log excerpt"
---

# Surface data, don't classify it

This is the one rule in the codebase's own `CLAUDE.md` literally labeled a Principle:

> The CLI's job is to fetch and present raw-enough data; the agent's job is to interpret
> it. Whenever the CLI is tempted to derive a categorical enum from raw GitHub fields
> (e.g. "this CI failure is transient", "this comment is noise", "this review is a nit"),
> prefer instead to ship the raw fields and any context the agent would otherwise have to
> fetch separately — log tails, step names, summaries, author logins.

## The test, not the vibe

The rule of thumb is a concrete test, not a stylistic preference:

> If removing a classification would force the agent to make another tool call to recover
> the same information, surface that information in the CLI output instead. If the agent
> already has the data and the classification is just a one-liner over it, delete the
> classification.

That test cuts both ways. It is not "never classify anything" — a rollup that summarizes
raw state without discarding it is fine. It's specifically aimed at a categorical judgment
that *replaces* the underlying fields, forcing the agent to either trust the label blindly
or re-fetch what it was hiding.

## What this looks like in the output

- CI failures carry the failed job name, the failed step, and a bounded log excerpt when
  triage can fetch them — not a `"transient" | "real"` verdict. The agent reads the log
  excerpt and decides. (External checks, `CANCELLED`, `STARTUP_FAILURE`, and a few
  fetch-failure edge cases don't have a job or log to attach.)
- Review threads and their inline comments carry the raw `authorAssociation` and a
  true-only `viewerDidAuthor`, plus Shepherd's own `authorType` (`User`/`Bot`/`Unknown`)
  — never a derived trust label. Top-level PR comments carry `authorAssociation` and
  `authorType` the same way, but GitHub's schema has no `viewerDidAuthor` field for that
  comment type, so it isn't part of that provenance there.
- Merge-blocking state is a set of raw requirement rows (`Approvals: 1/2 [Required]`,
  `Conversations Resolved: No [Required]`), not a single "why is this blocked" sentence.

## What's exempt, and why

Two categories are exempt because they are not classifications of ambiguous signal — they
are the state machine's own vocabulary:

- **State-machine actions** — `wait`, `fix_code`, `mark_ready`, `merge`, `cancel`,
  `escalate` — are transitions with a fixed, published trigger table (see
  [Deterministic orchestration, agentic judgment](/principles/deterministic-over-agentic/)),
  not a judgment call about the PR's content.
- **Rollups required by the calling skill** — a `ShepherdStatus` or a merge-status summary
  — restate raw state in one place; they don't discard it. The full detail is still
  printed alongside.

## The downstream effect: an honest "not supported" list

Held to consistently, this principle produces a specific kind of humility. Shepherd
explicitly does **not** decide whether a CI failure needs a code fix or a rerun, and does
not label a thread `actionable` vs `informational` — both are listed as non-goals in
`features.md`, not silently punted. Declining to classify is treated as a design decision
worth stating, not a gap to paper over.
