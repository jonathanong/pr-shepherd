---
title: "pr-shepherd"
description: "Deterministic Draft → Merged PRs for agents. Gather all PR context in one poll, get back exactly one next action."
docs:
  - path: "docs/README.md"
    label: "Full documentation index"
---

<div class="hero">
<p class="kicker">for agents finishing pull requests</p>

# Deterministic Draft → Merged PRs for agents

<p class="tagline">An agent finishing a PR should think about code, not reconstruct GitHub state or invent a next-step policy each tick.</p>
</div>

Without Shepherd it fans out across GitHub MCP, `gh`, and GraphQL, then guesses what to do
with the result. Shepherd does two jobs instead: **gather all context for a PR** in one
invocation, then **emit exactly one deterministic action** for the calling agent to run.

<div class="terminal">
<div class="terminal-bar"><span></span><span></span><span></span></div>

```text
$ pr-shepherd 123 --merge

# PR #123 [FIX_CODE]

status  UNRESOLVED_COMMENTS · merge  CLEAN · state  OPEN
summary 3 passing

## Review threads

### src/commands/iterate/index.mts:42 (@alice · MEMBER)

> The variable name is misleading.

## Failing checks

- CI › lint / typecheck / test (22.x) [conclusion: FAILURE]

## Instructions

1. Review each item under Review threads and Failing checks and decide
   whether it needs a code change.
2. Apply every warranted fix, then push to the PR head branch.
3. Run the generated review-mutation command, then iterate again.
```

</div>

The agent still decides whether a comment or a CI failure needs a code change — Shepherd
does not classify signal vs. noise, and it never mutates git itself. It only tells you
what happened and what to run next.

## Six actions, nothing else

Every `iterate` tick — CLI, MCP, or the programmatic API — collapses to exactly one of
these. There is no seventh action and no "it depends."

<ul class="action-badges">
<li>WAIT</li>
<li>MARK_READY</li>
<li>FIX_CODE</li>
<li>MERGE</li>
<li>CANCEL</li>
<li>ESCALATE</li>
</ul>

`FIX_CODE` is the only non-terminal action that hands work back to the agent; only
`ESCALATE` hands the PR to a human. `CANCEL` just stops polling — merged, closed, or a
clean PR that settled through its ready-delay.

## Install

<div class="install-grid">

<div class="install-method">

**Claude Code**

```bash
claude /plugin marketplace add jonathanong/pr-shepherd
claude /plugin install pr-shepherd
```

</div>

<div class="install-method">

**Codex**

```bash
codex plugin marketplace add jonathanong/pr-shepherd
```

</div>

<div class="install-method">

**Grok**

```bash
grok plugin marketplace add jonathanong/pr-shepherd
grok plugin install pr-shepherd --trust
```

</div>

<div class="install-method">

**MCP only**

```bash
npx --yes --package pr-shepherd@latest pr-shepherd-mcp
```

</div>

</div>

## Where to go next

<div class="card-grid">

- [**Principles**](/principles/) — the beliefs behind the design: why full context beats
  streaming, and why deterministic orchestration and agentic judgment are a split, not a
  hierarchy.
- [**Full documentation**](docs/README.md) — the exhaustive, agent-facing spec every page
  on this site links out to for the details.
- [**GitHub**](https://github.com/jonathanong/pr-shepherd) — source, issues, and releases.

</div>
