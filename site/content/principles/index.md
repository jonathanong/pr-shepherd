---
title: "Principles"
description: "The beliefs behind pr-shepherd's design, and why each one is load-bearing rather than decorative."
order: 1
docs:
  - path: "docs/architecture.md"
    label: "Architecture — design rationale"
  - path: "CLAUDE.md"
    label: "CLAUDE.md — contributor-facing principles"
---

# Principles

pr-shepherd is opinionated on purpose. Each principle below is a constraint the codebase
actually enforces — not aspirational language. Where that's checkable from the outside
(a decision table, a finite trigger list, a fixed exit-code map), the page says so.

<div class="card-grid">

- [**Full context over streaming**](/principles/full-context-over-streaming/) — one
  batched poll replaces a tool-call fan-out, and beats CI-only waiters that hide review
  comments until checks finish.
- [**Deterministic orchestration, agentic judgment**](/principles/deterministic-over-agentic/)
  — a split, not a hierarchy. Shepherd decides the next state; the agent decides what to
  change.
- [**Surface data, don't classify it**](/principles/surface-data-dont-classify/) — ship raw
  fields, not a one-liner enum over them, whenever the agent would otherwise re-fetch the
  same thing.
- [**Never mutate git**](/principles/never-mutate-git/) — Shepherd emits commands; the
  calling agent runs them, because it already owns the git lifecycle.
- [**Every item surfaces at least once**](/principles/every-item-surfaces-once/) — outdated,
  resolved, and minimized review items are never silently dropped.
- [**A portable state machine, not a hosted agent**](/principles/portable-not-hosted/) — the
  same action model over CLI, MCP, and the programmatic API, with no durable state that
  can't be deleted.

</div>
