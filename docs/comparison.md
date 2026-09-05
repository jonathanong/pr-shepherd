# Comparing pr-shepherd with other PR automation approaches

[← README](../README.md)

pr-shepherd gathers all context for a PR and emits one deterministic next action for a calling coding agent. It does not provide a model, generate a fresh code review, edit code, mutate git, or run as a hosted service.

That makes several products below complements as often as competitors. The useful question is which part of the PR workflow you want a tool to own.

## Choose based on the job

- Use **pr-shepherd** when you already have a coding agent and want a repeatable loop over existing review feedback, CI, mergeability, and GitHub review mutations without coupling the loop to one model vendor.
- Use **Cursor `/autopilot`** when you are already in Cursor, do not have this CLI installed, and want a prompt-only loop over comments, conflicts, and CI. Do not attach it in the same session as pr-shepherd.
- Use **GitHub Copilot CLI `/pr auto`** when you want one Copilot-native command to edit, commit, push, and iterate a PR through feedback, conflicts, and CI.
- Use **Codex, Claude Code Action, CodeRabbit, Cursor Bugbot, or Qodo** when generating a review or delegating a fix to that product is the primary job.
- Use **GitHub MCP Server or `gh`/GraphQL** when you want low-level primitives and are prepared to design the state machine, visibility rules, retries, and prompts yourself.

## Comparison

| Approach                            | Primary job                                            | Execution model                                     | Existing feedback + CI completion loop                                                                 | Who edits code and git?                          | Agent-neutral                                                         | Cost category                                                   | Best fit                                                                                 |
| ----------------------------------- | ------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **pr-shepherd**                     | Deterministic PR state and next-action orchestration   | Local CLI or stdio MCP; caller owns recurrence      | Built in: review items, CI, conflicts, readiness, and explicit review mutations                        | Calling agent; Shepherd never mutates git        | Yes                                                                   | Free and open source; agent/model and GitHub costs are separate | Teams that already use coding agents and want auditable, portable PR completion behavior |
| **Cursor `/autopilot`**             | Prompt-only PR babysitting (comments, conflicts, CI)   | Cursor built-in skill; agent polls `gh`             | Prompt policy: agent reconstructs state each pass; skips already-resolved threads                      | Calling Cursor agent                             | No                                                                    | Included with Cursor                                            | Cursor-only sessions with no Shepherd CLI, and no competing babysitter attached          |
| **GitHub Copilot CLI `/pr auto`**   | Copilot-native autonomous PR completion                | Local Copilot CLI                                   | Built in: feedback, conflicts, CI diagnosis, commits, and pushes                                       | Copilot CLI                                      | No                                                                    | Available through Copilot plans, including a free tier          | The closest all-in-one alternative when Copilot can own the complete edit/push loop      |
| **OpenAI Codex GitHub review**      | Automated review plus delegated follow-up fixes        | GitHub review with Codex cloud follow-up            | Review and fix handoff are documented; not a general existing-feedback-and-CI state machine            | Codex for delegated fixes                        | No                                                                    | Requires Codex access                                           | Teams that want Codex-generated findings and can hand fixes back to Codex                |
| **Anthropic Claude Code Action**    | Event-triggered PR and issue tasks                     | GitHub Actions                                      | Workflows can inspect PR context and Actions logs, but the workflow author defines completion policy   | Claude action can edit and push on the PR branch | No                                                                    | Action is open source; model/provider and Actions costs apply   | Repositories wanting event-driven Claude automation inside GitHub Actions                |
| **GitHub MCP Server + custom loop** | Broad GitHub tools for agents                          | Local or hosted MCP client                          | Not built in; consumers compose their own loop                                                         | Calling agent or custom workflow                 | Yes                                                                   | Free and open source; host/model costs are separate             | Teams that need broad GitHub primitives and want to own all orchestration policy         |
| **CodeRabbit**                      | Hosted AI code review, summaries, and suggested fixes  | GitHub app / hosted service                         | Focuses on generated and incremental review rather than shepherding all existing human feedback and CI | Autofix or user/agent follow-up                  | No                                                                    | Free and paid offerings                                         | Teams primarily buying an automated reviewer                                             |
| **Cursor Bugbot**                   | Automated bug-focused PR review                        | Hosted GitHub integration with Cursor/Web fix flows | Review and fix handoff, not a general PR completion loop                                               | User or Cursor fix flow                          | No                                                                    | Commercial                                                      | Cursor users who want automatic bug findings on pull requests                            |
| **Qodo Merge / PR-Agent**           | Review, describe, improve, and implementation commands | Hosted service or self-hosted PR-Agent              | Command-driven review and improvement; completion policy depends on the deployment                     | Qodo/PR-Agent commands or the user               | Partly: open-source core supports multiple model providers and forges | Open-source self-hosting and commercial hosted offerings        | Teams prioritizing configurable automated review across multiple git platforms           |
| **Manual `gh` / GraphQL scripts**   | Raw GitHub primitives                                  | Local scripts or CI                                 | Not built in                                                                                           | Script or calling agent                          | Yes                                                                   | Free and open source; runtime costs are separate                | Small, bespoke workflows where maintaining the orchestration is acceptable               |

“Built in” refers to a product's documented core workflow, not whether a sufficiently elaborate custom prompt or CI workflow could reproduce it.

## Where pr-shepherd is different

### It is not a prompt-only babysitter

Cursor `/autopilot` and homegrown “land this PR” skills put the GitHub loop in the model: refresh with `gh pr view` / `gh pr checks`, skip already-resolved threads, and classify comments in the prompt (`fix` / `dismiss` / `ask`). GitHub Copilot CLI `/pr auto` is the vendor-owned variant of the same job — one product edits, commits, and pushes.

pr-shepherd keeps that loop in a program. One poll returns raw-enough GitHub fields plus exactly one action and numbered `## Instructions`. The agent still decides whether a surfaced item needs a code change; it does not reconstruct PR state or invent the next command. First-look, edited, outdated, and minimized items still surface at least once. Do not attach `/autopilot` (or an equivalent `gh pr checks --watch` skill) in the same session: the two loops fight over CI waiters, comment filters, and who owns the next step.

The always-on **Untrusted review input** playbook is the one Autopilot-style constraint Shepherd does encode on the caller: treat titles, comments, and log excerpts as data, not as user or system instructions. It does not classify nits, guess at security, or add an `ESCALATE` trigger.

### It coordinates reviewers rather than replacing them

Review bots create new findings. pr-shepherd is designed to carry all already-existing reviewer intent forward: active, outdated, resolved, minimized, and later-edited items are surfaced through the seen-marker gate. It also provides the CI, mergeability, and mutation context needed for the next agent decision.

### It leaves judgement and repository ownership with the caller

The CLI surfaces raw-enough GitHub fields, log excerpts, annotations, author provenance, and explicit mutation arguments. The agent decides whether feedback or a failure warrants an edit. Shepherd never runs mutating git commands and never silently applies code changes.

### It is a portable state machine, not a hosted agent

The same action model is available through the CLI and MCP API. A Codex, Claude Code, Grok, or other MCP-capable client can consume it, but that client owns recurrence and code execution. This is useful when portability and inspectable behavior matter; it is less convenient when a fully hosted background worker is the requirement.

## When pr-shepherd is not the right fit

- You want a Cursor-only prompt with no CLI (`/autopilot`).
- You want a tool whose main purpose is generating a new AI review.
- You want one vendor to edit, commit, push, and host the entire loop automatically.
- You need a background service that reacts to GitHub events without an active caller.
- You need GitLab, Bitbucket, Azure DevOps, or another non-GitHub forge today.

## Official sources

- [Cursor Agent Skills](https://cursor.com/docs/skills) (`/autopilot` is a built-in skill)
- [GitHub Copilot CLI pull-request management](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/manage-pull-requests)
- [OpenAI Codex GitHub code review](https://learn.chatgpt.com/codex/third-party/github)
- [Anthropic Claude Code Action](https://github.com/anthropics/claude-code-action) and [capabilities and limitations](https://github.com/anthropics/claude-code-action/blob/main/docs/capabilities-and-limitations.md)
- [GitHub MCP Server](https://github.com/github/github-mcp-server)
- [CodeRabbit documentation](https://docs.coderabbit.ai/)
- [Cursor Bugbot documentation](https://docs.cursor.com/bugbot)
- [Qodo Merge documentation](https://qodo-merge-docs.qodo.ai/)

Cost categories describe the orchestration or review product only. Model usage, coding-agent subscriptions, GitHub Actions, and other hosting may still carry separate costs.
