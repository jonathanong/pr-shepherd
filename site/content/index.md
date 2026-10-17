---
title: "pr-shepherd"
description: "Drive a pull request to merge-ready with your coding agent. One call gathers the whole PR; one action says what to do next. Works with Claude Code, Codex, Grok, and any stdio MCP client."
docs:
  - path: "README.md"
    label: "README — outcomes, evidence, and install"
  - path: "docs/README.md"
    label: "Full documentation index"
---

<div class="hero">
<p class="kicker">for agents finishing pull requests</p>

# Get your agent's PRs to merge-ready

<p class="tagline">Your coding agent fixes the code. Shepherd tells it what GitHub wants next: every review comment, every failing check, and the merge requirements GitHub reports, in one call.</p>
</div>

**About 42% cheaper per PR than `gh` and 77% cheaper than the GitHub MCP server.** Waiting on
CI costs about 60 GraphQL points an hour instead of 360.

<div class="terminal">
<div class="terminal-bar"><span></span><span></span><span></span></div>

```text
$ pr-shepherd 123

# PR #123 [FIX_CODE]

status UNRESOLVED_COMMENTS · repo owner/repo
summary 3 passing

## Review threads

### src/commands/iterate/index.mts:42 (@alice · MEMBER)

> The variable name is misleading.

## Failing checks

- CI › lint / typecheck / test (22.x) [conclusion: FAILURE]
  > oxfmt

## Instructions

1. Fix each warranted item.
2. Triage ## Failing checks. Playbook: "CI failure triage".
3. Commit and push any changes.
4. Journal key decisions: pr-shepherd apply journal 123 '- <decision>'
5. Reply to the thread: pr-shepherd apply review 123 --reply-thread-ids …
6. Rerun Shepherd now.
```

</div>

## What you get

<div class="card-grid">

- [**It sees the whole PR**](docs/handled-cases.md) One call returns review threads, comments,
  CI failures with log excerpts when available, and the real merge requirements. It handles 60 GitHub edge
  cases, like a cancelled run that needs a rerun rather than a code fix.
- [**It costs less to run**](https://github.com/jonathanong/pr-shepherd/blob/main/evals/tokens/README.md)
  An estimated 42% lower cost per PR session than `gh`, and 77% lower than the GitHub MCP
  server.
- [**Your agent knows what to do next**](https://github.com/jonathanong/pr-shepherd/blob/main/evals/README.md)
  Every tick ends in one action, and every action but `CANCEL` comes with numbered steps. On tricky GitHub cases, eval scores
  rise from 0.82 to 0.94, about two-thirds fewer misses.
- [**It's easy on your rate limit**](docs/github-api.md) Waiting on CI costs about 60
  GraphQL points an hour, against about 360 for `gh pr checks --watch`. Idle waits cost
  about 4.
- [**It never touches your git**](docs/escalations.md) Shepherd runs zero git mutations and
  never merges on its own. It hands off to a human only for 10 specific reasons.
- [**It works with your agent**](docs/mcp.md) Plugins for Claude Code, Codex, and Grok, a
  local stdio MCP server for other clients, and a CLI for shells and CI. Native stacked PRs are
  supported.

</div>

## How it works

Your agent asks Shepherd about a PR. Shepherd reads GitHub and answers with exactly one
action:

<ul class="action-badges">
<li>WAIT</li>
<li>READY</li>
<li>MARK_READY</li>
<li>FIX_CODE</li>
<li>MERGE</li>
<li>CANCEL</li>
<li>ESCALATE</li>
</ul>

A `--stack` poll can also return `SHEPHERD`, which starts a session for each stack layer you own.

The agent follows the printed steps, pushes, and asks again. `READY` means a clean PR is
settling; the loop ends at `CANCEL`, or at `ESCALATE` when a human is needed. The agent
still decides what each comment deserves.

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

Then install and enable the `pr-shepherd` plugin in Codex.

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

<div class="install-method">

**CLI, for shells and CI**

```bash
npm install -g pr-shepherd
```

</div>

</div>

Then ask your agent to shepherd a PR, for example `/goal /pr-shepherd:pr-shepherd 42` in
Claude Code.

## Where to go next

<div class="card-grid">

- [**README**](README.md) The outcomes in detail, with the evidence behind each number.
- [**Principles**](/principles/) The beliefs behind the design.
- [**GitHub**](https://github.com/jonathanong/pr-shepherd) Source, issues, and releases.

</div>
