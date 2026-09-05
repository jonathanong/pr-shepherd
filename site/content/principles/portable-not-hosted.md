---
title: "A portable state machine, not a hosted agent"
description: "The same action model over CLI, MCP, and the programmatic API — safe to interrupt, and agent-neutral by construction."
order: 6
docs:
  - path: "docs/architecture.md"
    label: "architecture.md — one local MCP surface, module map, dependency rules"
  - path: "docs/comparison.md"
    label: "comparison.md — the agent-neutral comparison table"
---

# A portable state machine, not a hosted agent

Shepherd isn't a service you point your PRs at. It's a local process — a CLI or a stdio
MCP server — that any caller can run, inspect, and kill.

## One state machine, three ways in

The CLI, the MCP server, and the programmatic `pr-shepherd` package all resolve to the
same `iterate`/`apply`/`build_suggestion_patches` behavior, sharing the same command
implementations and token resolution underneath:

> A version-matched stdio server is the canonical agent integration; it shares command
> implementations and token resolution with the CLI. Plugins only declare the same local
> server.

That's why the Claude Code, Codex, and Grok skills are thin dispatchers rather than
model-specific logic: any MCP client can speak to the same tool contract, and the CLI
gives you the identical result from a shell or a CI job.

## Agent-neutral is a checkable claim, not a slogan

`docs/comparison.md` runs an explicit comparison table against review bots, hosted GitHub
Actions, and custom `gh`/GraphQL scripts. Only three rows answer "Agent-neutral: Yes" —
pr-shepherd, a hand-rolled GitHub MCP Server loop, and manual scripts — and pr-shepherd is
the only one of those three with the completion loop already built in:

> When you already have a coding agent and want a repeatable loop over existing review
> feedback, CI, mergeability, and GitHub review mutations without coupling the loop to one
> model vendor.

## Safe to interrupt

Nothing durable lives in the process. The PR itself, on GitHub, is the source of truth;
local state exists only to avoid re-doing work across ticks:

> Durable state lives in the PR on GitHub; the iterate loop self-terminates when the PR is
> merged, closed, or settles after ready-delay. Local state in
> `$PR_SHEPHERD_STATE_DIR` can be deleted without data loss.

Kill the process mid-poll, delete the state directory, restart from a different machine —
the next `iterate` tick reconstructs everything it needs from GitHub and picks up exactly
where a fresh run would. There's no session to lose, because there was never a hosted
session to begin with.

## What this trades away

A portable state machine is a worse fit than a hosted agent when the actual requirement is
a background worker that reacts to GitHub events with nobody driving it — Shepherd has no
webhook listener and doesn't run unattended. It's the right fit when portability and
inspectable behavior matter more than that: you can read the entire decision table, run it
from a terminal, and get the same answer a CI job would.
