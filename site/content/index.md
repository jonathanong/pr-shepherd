---
title: "pr-shepherd"
description: "Drive a pull request to merge-ready with your coding agent. One call gathers the whole PR; one action says what to do next. Works with Claude Code, Codex, Grok, and any stdio MCP client."
docs:
  - path: "README.md"
    label: "README — benefits, usage, and install"
  - path: "docs/README.md"
    label: "Full documentation index"
---

<div class="hero">
<p class="kicker">for agents finishing pull requests</p>

# Get your agent's PRs to merge-ready

<p class="tagline">Your coding agent fixes the code. Shepherd tells it what GitHub wants next: every review comment, every failing check, and the merge requirements GitHub reports, in one call.</p>
</div>

**Modeled at about 34% cheaper per PR than `gh` and 75% cheaper than the GitHub MCP server.**
A modeled PR session spends about 33 GraphQL points of your GitHub quota, against 96 for `gh`.

<div class="terminal">
<div class="terminal-bar"><span></span><span></span><span></span></div>

```text
$ pr-shepherd 123

# PR #123 [TRIAGE]

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
4. Journal key decisions or rejections with URLs or IDs: pr-shepherd apply journal 123 '- <decision>'
5. $CHANGE_MESSAGE: one sentence on what changed. Run even if no code changed: pr-shepherd apply review 123 --reply-thread-ids PRRT_kwDOSGizTs58XB1L --message "$CHANGE_MESSAGE" --require-sha HEAD
6. Rerun Shepherd now.
```

</div>

## What you get

<div class="card-grid">

- [**It sees the whole PR**](docs/handled-cases.md) One call returns review threads, comments,
  CI failures with log excerpts when available, and the real merge requirements. It handles 76 GitHub edge
  cases, like a cancelled run that needs a rerun rather than a code fix.
- [**It costs less to run**](https://github.com/jonathanong/pr-shepherd/blob/main/evals/tokens/README.md)
  A modeled 34% lower cost per PR session than `gh` (30–38% across realistic context sizes), and
  75% lower than the GitHub MCP server, assuming a warm prompt cache.
- [**Your agent knows what to do next**](https://github.com/jonathanong/pr-shepherd/blob/main/evals/README.md)
  Every tick ends in one action, and every action but `CANCEL` comes with numbered steps. Across 71 PR
  states, the agent scores 0.95 with the plugin and 0.57 with `gh` and the GitHub MCP server.
- [**It's easy on your rate limit**](docs/github-api.md) A modeled PR session spends about
  33 GraphQL points against 96 for `gh`. Waiting on CI costs about 60 points an hour,
  against about 360 for `gh pr checks --watch`. Unchanged idle waits can cost as little as 4.
- [**It never touches your git**](docs/escalations.md) Shepherd runs zero git mutations and
  never merges on its own. For a single PR, it hands off to a human only for 9 specific
  reasons.
- [**It works with your agent**](docs/mcp.md) Plugins for Claude Code, Codex, and Grok, a
  CLI for shells and CI, and an opt-in local stdio MCP server. Native stacked PRs are
  supported.

</div>

## How it works

Your agent asks Shepherd about a PR. Shepherd reads GitHub and answers with exactly one
action:

<ul class="action-badges">
<li>WAIT</li>
<li>READY</li>
<li>MARK_READY</li>
<li>TRIAGE</li>
<li>MERGE</li>
<li>CANCEL</li>
<li>ESCALATE</li>
</ul>

A `stack` poll can also return `SHEPHERD`, which starts a session for each stack layer you own.

The agent follows the printed steps, pushes, and asks again. `READY` means a clean PR is
settling; the loop ends at `CANCEL`, or at `ESCALATE` when a human is needed. The agent
still decides what each comment deserves.

## Install

<div class="install-grid">

<div class="install-method">

**Claude Code**

```bash
claude plugin marketplace add jonathanong/harness-plugins
claude plugin install pr-shepherd@harness-plugins
```

Previously added the `pr-shepherd` marketplace? Run `claude plugin marketplace remove pr-shepherd` first.

</div>

<div class="install-method">

**Codex**

```bash
codex plugin marketplace add jonathanong/harness-plugins --ref main
codex plugin add pr-shepherd@harness-plugins
```

Previously added the `pr-shepherd` marketplace? Run `codex plugin remove pr-shepherd@pr-shepherd` and `codex plugin marketplace remove pr-shepherd` first.

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
pnpm i -g pr-shepherd
```

</div>

</div>

Then ask your agent to shepherd a PR, for example `/goal /pr-shepherd:pr-shepherd 42` in
Claude Code.

## Where to go next

<div class="card-grid">

- [**README**](README.md) Benefits, with links to the evidence behind each number, plus usage and install.
- [**Principles**](/principles/) The beliefs behind the design.
- [**GitHub**](https://github.com/jonathanong/pr-shepherd) Source, issues, and releases.

</div>
