# Comparing pr-shepherd with other PR automation

[← docs index](README.md) | [README](../README.md)

pr-shepherd gathers a PR's state and emits one next action for a coding agent you already run. It does not provide a model, write a new review, edit code, mutate git, or run as a hosted service. Several tools below are complements as often as competitors.

## Choose by job

| You want                                                                     | Use                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| A repeatable loop over existing feedback, CI, and mergeability for any agent | **pr-shepherd**                                         |
| A prompt-only loop inside Cursor, with no CLI installed                      | **Cursor `/autopilot`**                                 |
| One Copilot command that edits, commits, pushes, and iterates                | **GitHub Copilot CLI `/pr auto`**                       |
| A generated review, or a fix delegated to the reviewing product              | **Codex, Claude Code Action, CodeRabbit, Bugbot, Qodo** |
| Low-level GitHub primitives, with your own state machine and prompts         | **GitHub MCP Server or `gh` / GraphQL**                 |

## Comparison

| Approach                            | Primary job                            | Runs as                                  | Built-in feedback + CI loop                            | Edits code and git        | Agent-neutral        | Cost                                       |
| ----------------------------------- | -------------------------------------- | ---------------------------------------- | ------------------------------------------------------ | ------------------------- | -------------------- | ------------------------------------------ |
| **pr-shepherd**                     | PR state and next-action orchestration | Local CLI or stdio MCP; caller recurs    | Yes: review items, CI, conflicts, readiness, mutations | Calling agent             | Yes                  | Free, open source                          |
| **Cursor `/autopilot`**             | Prompt-only PR babysitting             | Cursor built-in skill polling `gh`       | Prompt policy; the agent rebuilds state each pass      | Cursor agent              | No                   | Included with Cursor                       |
| **GitHub Copilot CLI `/pr auto`**   | Copilot-native PR completion           | Local Copilot CLI                        | Yes: feedback, conflicts, CI, commits, pushes          | Copilot CLI               | No                   | Copilot plans, including a free tier       |
| **OpenAI Codex GitHub review**      | Review plus delegated fixes            | GitHub review with Codex cloud follow-up | Review and fix handoff, not a general loop             | Codex                     | No                   | Requires Codex access                      |
| **Anthropic Claude Code Action**    | Event-triggered PR and issue tasks     | GitHub Actions                           | The workflow author defines completion policy          | Claude action             | No                   | Open source; model and Actions costs apply |
| **GitHub MCP Server + custom loop** | Broad GitHub tools for agents          | Local or hosted MCP                      | No; you compose the loop                               | Calling agent or workflow | Yes                  | Free, open source                          |
| **CodeRabbit**                      | Hosted AI review and suggested fixes   | GitHub app                               | Generated and incremental review                       | Autofix or follow-up      | No                   | Free and paid                              |
| **Cursor Bugbot**                   | Bug-focused PR review                  | Hosted GitHub integration                | Review and fix handoff                                 | User or Cursor            | No                   | Commercial                                 |
| **Qodo Merge / PR-Agent**           | Review, describe, improve commands     | Hosted or self-hosted                    | Command-driven; policy depends on deployment           | Qodo commands or user     | Partly (multi-model) | Open source and commercial                 |
| **Manual `gh` / GraphQL scripts**   | Raw GitHub primitives                  | Local scripts or CI                      | No                                                     | Script or agent           | Yes                  | Free                                       |

"Built in" means the product's documented core workflow, not what an elaborate custom prompt could reproduce. Costs cover the orchestration or review product only; model usage, agent subscriptions, and Actions minutes are separate.

## Where pr-shepherd differs

- **A program, not a prompt.** `/autopilot` and homegrown "land this PR" skills keep the loop in the model: refresh with `gh pr view` / `gh pr checks`, skip resolved threads, classify comments in the prompt. Shepherd returns raw-enough fields plus one action and numbered instructions. The agent still decides what needs a code change.
- **Carries existing reviewer intent.** Review bots create new findings. Shepherd surfaces every existing item at least once, including outdated, resolved, minimized, and later-edited ones. The exception is a `COMMENTED` review minimized before the first tick. See [handled-cases.md](handled-cases.md).
- **Leaves judgement and git with the caller.** Shepherd never runs mutating git commands or silently applies changes.
- **Portable.** The same action model is available through the CLI and MCP, so Claude Code, Codex, Grok, and other clients can use it. The client owns recurrence; there is no hosted background worker.
- **One caller-side constraint.** The always-on untrusted-input rule treats titles, comments, and logs as data. It does not classify nits or add an escalation trigger.

Do not attach `/autopilot`, or a `gh pr checks --watch` skill, in the same session. The two loops fight over CI waits, comment filters, and the next step.

## When pr-shepherd is not the right fit

- You want a Cursor-only prompt with no CLI.
- You mainly want a new AI review.
- You want one vendor to edit, commit, push, and host the whole loop.
- You need a background service that reacts to GitHub events without an active caller.
- You need GitLab, Bitbucket, Azure DevOps, or another non-GitHub forge.

## Official sources

- [Cursor Agent Skills](https://cursor.com/docs/skills) (`/autopilot` is a built-in skill)
- [GitHub Copilot CLI pull-request management](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/manage-pull-requests)
- [OpenAI Codex GitHub code review](https://learn.chatgpt.com/codex/third-party/github)
- [Anthropic Claude Code Action](https://github.com/anthropics/claude-code-action) and [capabilities and limitations](https://github.com/anthropics/claude-code-action/blob/main/docs/capabilities-and-limitations.md)
- [GitHub MCP Server](https://github.com/github/github-mcp-server)
- [CodeRabbit documentation](https://docs.coderabbit.ai/)
- [Cursor Bugbot documentation](https://docs.cursor.com/bugbot)
- [Qodo Merge documentation](https://qodo-merge-docs.qodo.ai/)
