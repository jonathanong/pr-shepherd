# pr-shepherd

Autonomous PR CI monitor and review-comment resolver for Claude Code.

## Why pr-shepherd

Concrete improvements to an agentic PR-review workflow:

- **Faster monitor loops** — one batched GraphQL query per tick (see [docs/graphql.md](docs/graphql.md)) instead of N REST round-trips
- **Lower context usage per iteration** — classification lives in TypeScript; the agent receives one decision per tick and never sees raw GraphQL payloads or resolved threads
- **Deterministic output** — `--format=json` and `--format=text` surface equivalent information, so both scripts and agents see the same state
- **Prompt-cache friendly** — the 4-minute default tick is tuned to Claude's 5-minute prompt-cache TTL (tunable via `watch.interval`)
- **Reduced GitHub rate-limit exposure** — read results share a 5-minute file cache with atomic writes (see [docs/cache.md](docs/cache.md))
- **No MCP surface** — skills call the CLI via `npx`; no long-lived MCP server, no extra auth boundary, smaller reasoning surface
- **Skills over subagents** — skill prompts inject into the main conversation rather than spawning a subagent that reloads CLAUDE.md every turn
- **Safe to interrupt** — all state lives in the PR on GitHub; the cron loop self-terminates when the PR is merged, closed, or settles after ready-delay

## Design principles

- **Reduced agent context** — logic lives in the CLI, not the prompt
- **Reduced GitHub rate-limit exhaustion** — primary PR state is fetched via a batched GraphQL query
- **Fewer tool calls** — comment resolutions are batched; resolved threads never reach the agent
- **No MCP** — smaller reasoning surface, much faster than the GitHub MCP
- **No vendor lock-in** — runs against `gh` + `git`; no hosted service required
- **Skills over subagents** — subagents reload all CLAUDE.md context on every turn; skills inject into the main conversation instead, keeping cost low
- **JSON/text parity** — `--format=json` and `--format=text` carry equivalent information; every field in one has a representation in the other

## Features

pr-shepherd is split into a CLI (deterministic, pure GitHub I/O) and three Claude Code skills that wrap the CLI with model-driven flow and mutation.

### What the CLI does

Deterministic commands that fetch, classify, and mutate PR state without invoking the model:

- **`check`** — one-shot PR snapshot (merge state, CI results, unresolved comments) via a single batched GraphQL query
- **`resolve`** — fetch/triage mode auto-resolves outdated threads and returns actionable items (each annotated with any parseable ` ```suggestion ` block); mutate mode batch-resolves threads, minimizes comments, and dismisses reviews by ID, polling `--require-sha` so reviewers see the push before threads close
- **`commit-suggestion`** — applies a single reviewer ` ```suggestion ` block as a local git commit (one suggestion = one commit): builds a unified diff, validates it with `git apply --check`, commits with a caller-supplied message + `Co-authored-by: <reviewer>` trailer, and resolves the thread on GitHub
- **`iterate`** — classifies current PR state and emits exactly one of eight actions: `cooldown`, `wait`, `rerun_ci`, `mark_ready`, `rebase`, `fix_code`, `cancel`, `escalate` (see [docs/actions.md](docs/actions.md))
- **`status`** — multi-PR summary table, one lightweight GraphQL query per PR in parallel

Cross-cutting machinery: file cache with atomic writes ([docs/cache.md](docs/cache.md)), merge-status derivation ([docs/merge-status.md](docs/merge-status.md)), CI failure classification into `actionable` / `infrastructure` / `timeout` / `flaky` ([docs/checks.md](docs/checks.md)), outdated-thread detection ([docs/comments.md](docs/comments.md)), deprecation-warning-aware RC loader.

### What the skills do

Claude Code skills that wrap the CLI with model-driven triage, code edits, and flow control:

- **`/pr-shepherd:check`** — calls `check --format=json` and prints a human summary; never declares "ready to merge" unless every gate passes (merge status CLEAN, status READY, Copilot review not in progress)
- **`/pr-shepherd:monitor`** — creates a `/loop` cron job (4-minute default, 8-hour expiry, 50-turn cap), deduplicates via a `# pr-shepherd-loop:pr=<N>` tag in `CronList`, follows the `## Instructions` section emitted by `iterate` each tick (the `[ACTION]` H1 tag identifies the action for logging), runs rebase scripts and fix instructions in the main conversation
- **`/pr-shepherd:resolve`** — runs `resolve --fetch` and follows the `## Instructions` section embedded in the Markdown output; the CLI output describes the full triage/fix/push/resolve/report flow, including commit-suggestion preference and per-bucket dispatch rules

See [docs/skills.md](docs/skills.md) for full skill reference.

## Install

> **Note:** Skill and plugin install methods add the skill definitions only — they do not install the `pr-shepherd` CLI. The skills invoke `npx pr-shepherd`, so you also need the CLI available. If you're using `pr-shepherd` as development tooling for your repo, install it as a dev dependency so `npx` resolves it without prompting:
>
> ```bash
> npm install --save-dev pr-shepherd
> ```
>
> A plain `npm install pr-shepherd` adds it to regular dependencies instead; use that only if you specifically want it under `dependencies`. Or install globally: `npm install -g pr-shepherd`.

### As individual skills via `npx skills`

```bash
npx skills add jonathanong/pr-shepherd
```

Installs the three skills (`check`, `monitor`, `resolve`) into your agent's skill directory (`.claude/skills/` for project scope, `~/.claude/skills/` with `-g` for global scope). Powered by [skills.sh](https://skills.sh).

### As a Claude Code plugin (recommended)

```bash
claude /plugin marketplace add jonathanong/pr-shepherd
claude /plugin install pr-shepherd
```

This repo ships two `marketplace.json` files that serve different install flows: the root `marketplace.json` resolves the plugin from the npm registry (used by the `claude /plugin marketplace add` command above); `.claude-plugin/marketplace.json` is the owner-level registry manifest that resolves the plugin from the local plugin directory (used when Claude Code installs from a local or git-based source). Both files are needed to support these two install paths.

See [Usage](#usage) below.

### Without the plugin — custom slash command

If you don't want the full plugin, create a project-local (or user-scope)
slash command that wraps the CLI directly. This still requires `pr-shepherd`
to be installed in the repository first (`npm install pr-shepherd`), so that
`npx pr-shepherd ...` runs without prompting to install the package.

1. **Create the command file:**
   - Project-scope: `.claude/commands/pr-check.md`
   - User-scope: `~/.claude/commands/pr-check.md`

2. **Paste this as the file contents:**

   ````markdown
   ---
   description: "Check GitHub CI status and review comments for the current PR"
   argument-hint: "[PR number or URL ...]"
   allowed-tools: ["Bash", "Read", "Grep"]
   ---

   # PR Status Check

   ## Arguments: $ARGUMENTS

   ## Resolve PR number(s)

   1. If `$ARGUMENTS` contains PR numbers or GitHub PR URLs, extract the number(s).
   2. Otherwise, infer: `gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --json number --jq '.[0].number'`
   3. If no PR found, report an error and stop.

   ## Run the check

   ```bash
   npx pr-shepherd check <PR_NUMBER> --format=json
   ```

   Parse the JSON and report:

   - **Merge status** (`mergeStatus.status`): CLEAN | BEHIND | CONFLICTS | BLOCKED | UNSTABLE | DRAFT | UNKNOWN
   - **CI check results** (`checks`): passing count, failing names, in-progress names
   - **Unresolved review comments** (`threads.actionable` + `comments.actionable`): count + details
   ````

3. **Use it in Claude Code:**

   ```
   /pr-check
   /pr-check 42
   ```

For `monitor` and `resolve` custom commands, do **not** copy the
[`plugin/skills/`](plugin/skills/) files directly — those contain skill/plugin-specific
frontmatter that is not valid for `.claude/commands/` files. Instead, create
`.claude/commands/pr-monitor.md` and/or `.claude/commands/pr-resolve.md`
using the same command-file structure as the `pr-check` example above, with
the CLI invocation changed to `npx pr-shepherd iterate ...` or
`npx pr-shepherd resolve ...`. To drive the CLI without Claude at all, see
[docs/usage.md](docs/usage.md).

### As a global CLI

```bash
npm install -g pr-shepherd
```

## Usage

### Monitor a PR

Creates a cron loop that fires every 4 minutes, checks CI and review
comments, fixes issues, and marks the PR ready for review when clean. The
loop cancels automatically when the PR is merged or closed.

```
/pr-shepherd:monitor                     # infer PR from current branch
/pr-shepherd:monitor 42
/pr-shepherd:monitor 42 every 8m
/pr-shepherd:monitor 42 --ready-delay 15m
```

### Check a PR

One-shot status snapshot — merge state, CI results, and unresolved comments.
Accepts multiple PR numbers.

```
/pr-shepherd:check        # infer from branch
/pr-shepherd:check 42
/pr-shepherd:check 41 42 43
```

### Resolve review comments

Fetches all actionable threads and comments, triages them, applies fixes,
pushes, then resolves/minimizes/dismisses via `--require-sha` (waits until
GitHub has seen the push before resolving).

```
/pr-shepherd:resolve       # infer from branch
/pr-shepherd:resolve 42
```

See [docs/skills.md](docs/skills.md) for full argument reference.

## Workflow

On each tick (4-minute default, tunable via `watch.interval`): fetch PR state in one GraphQL batch → classify CI, comments, and merge status → take one action (fix code, rebase, rerun CI, mark ready, or wait). See [docs/iterate-flow.md](docs/iterate-flow.md) for the decision table and [docs/flow.md](docs/flow.md) for the end-to-end flow diagram.

## CLI

End-users normally interact with pr-shepherd through the `/pr-shepherd:*` skills shown above. The full per-command CLI reference — signatures, flags, exit codes, JSON/Markdown output examples — lives in [docs/usage.md](docs/usage.md).

## Configuration

Create a `.pr-shepherdrc.yml` in your project root (or any parent directory) to override defaults. The loader walks up from `cwd` to `$HOME` (if `$HOME` is on that path) or the filesystem root; the first match wins.

```yaml
iterate:
  cooldownSeconds: 60 # wait longer after a push before reading CI
checks:
  ciTriggerEvents:
    - pull_request
    - pull_request_target
    - merge_group # add for merge-queue repos
actions:
  autoRebase: false # disable for repos that enforce merge commits
```

All supported keys:

| Key                                         | Default                                   | Purpose                                                                                                           |
| ------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `cache.ttlSeconds`                          | `300`                                     | File-cache TTL for read operations                                                                                |
| `iterate.cooldownSeconds`                   | `30`                                      | Wait after a push before reading CI                                                                               |
| `iterate.fixAttemptsPerThread`              | `3`                                       | Max fix attempts per unresolved thread before `escalate`                                                          |
| `iterate.stallTimeoutMinutes`               | `30`                                      | Minutes the loop may repeat the same action without progress before `escalate` with `stall-timeout`; `0` disables |
| `iterate.minimizeReviewSummaries.bots`      | `true`                                    | Auto-minimize COMMENTED review summaries from bot authors; surfaced (not dropped) when `false`                    |
| `iterate.minimizeReviewSummaries.humans`    | `true`                                    | Auto-minimize COMMENTED review summaries from human authors; surfaced when `false`                                |
| `iterate.minimizeReviewSummaries.approvals` | `false`                                   | Opt in to minimize APPROVED-state reviews (also enables >50-approval pagination)                                  |
| `watch.interval`                            | `"4m"`                                    | Monitor tick interval (tuned to Claude's 5-min prompt-cache TTL)                                                  |
| `watch.readyDelayMinutes`                   | `10`                                      | Settle window after READY before the monitor loop cancels                                                         |
| `watch.expiresHours`                        | `8`                                       | Max lifetime of a monitor cron job                                                                                |
| `watch.maxTurns`                            | `50`                                      | Max monitor ticks per session                                                                                     |
| `resolve.concurrency`                       | `4`                                       | Parallel fanout for per-thread GraphQL fetches                                                                    |
| `resolve.shaPoll.intervalMs`                | `2000`                                    | Poll interval when waiting for `--require-sha` to land on GitHub                                                  |
| `resolve.shaPoll.maxAttempts`               | `10`                                      | Max `--require-sha` polls before giving up                                                                        |
| `resolve.fetchReviewSummaries`              | `true`                                    | Surface `COMMENTED` review summaries in `resolve --fetch` output                                                  |
| `checks.ciTriggerEvents`                    | `["pull_request", "pull_request_target"]` | Workflow `on:` events treated as PR CI (add `merge_group` for merge-queue repos)                                  |
| `checks.timeoutPatterns`                    | see [`src/config.json`](src/config.json)  | Log patterns that classify a failure as `timeout`                                                                 |
| `checks.infraPatterns`                      | see [`src/config.json`](src/config.json)  | Log patterns that classify a failure as `infrastructure`                                                          |
| `checks.logMaxLines`                        | `50`                                      | Max log lines kept per failing check                                                                              |
| `checks.logMaxChars`                        | `3000`                                    | Max log characters kept per failing check                                                                         |
| `checks.errorLines`                         | `1`                                       | Trailing `##[error]`-marked log lines surfaced as `errorExcerpt` per failing check                                |
| `mergeStatus.blockingReviewerLogins`        | `["copilot"]`                             | Reviewer logins whose pending review or outstanding review request blocks `mark_ready`                            |
| `actions.autoResolveOutdated`               | `true`                                    | Auto-resolve threads that point to code no longer in the PR diff                                                  |
| `actions.autoRebase`                        | `true`                                    | Emit `rebase` for flaky failures when the branch is behind base                                                   |
| `actions.autoMarkReady`                     | `true`                                    | Emit `mark_ready` when a draft PR's CI goes clean                                                                 |
| `actions.commitSuggestions`                 | `true`                                    | Route `/pr-shepherd:resolve` through `commit-suggestion` (singular) for threads with a ` ```suggestion ` block    |

Environment variables: `GH_TOKEN` / `GITHUB_TOKEN` (auth; falls back to `gh auth token`), `PR_SHEPHERD_CACHE_DIR` (override cache base dir), `PR_SHEPHERD_CACHE_TTL_SECONDS` (override cache TTL; `--cache-ttl` takes precedence over this env var, which in turn takes precedence over the RC/config value).

See [docs/configuration.md](docs/configuration.md) for full semantics and deprecated-key migration.

## Requirements

- Node.js ≥ 22.0.0
- A GitHub token: set `GH_TOKEN` or `GITHUB_TOKEN`, **or** install and authenticate the `gh` CLI (`gh auth login`) — pr-shepherd uses `gh auth token` as a fallback. The `repo` scope is required for private repositories.
- `git`

## Docs

Full reference: [docs/README.md](docs/README.md) — CLI usage, skills, configuration, architecture, actions, debugging, and more.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the module map and dependency rules.

## Forking

See [docs/forking.md](docs/forking.md) if you want to customize pr-shepherd for your own use or team.

## License

[MIT](LICENSE)
