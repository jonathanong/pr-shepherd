# pr-shepherd

Autonomous PR CI monitor and review-comment resolver for Claude Code.
The goal is to have an agent take a plan to a human-reviewable PR autonomously.

Example Workflow:

1. `/model opusplan`
2. Create a plan
3. Accept the plan
4. Switch to Auto Mode
5. Prompt: `make a PR, then run /pr-shepherd:monitor`
6. ...
7. Human reviews PR with passing CI, no open threads, and all comments minimized

## How it works

`pr-shepherd` optimizes performance, rate limits, and orchestration by moving **ALL** logic and prompts to code via a CLI tool, enshrining what would be a large skill or command prompt (which the agent would inevitably make mistakes on) into the code and returning a clear, actionable prompt.

At a high-level, to start the monitor, the skill/command invokes a CLI that invokes a prompt:

```bash
> npx pr-shepherd monitor 123

Run /loop "npx pr-shepherd iterate 123" every 4 minutes
```

Each iteration calls `npx pr-shepherd iterate`, which provides actionable feedback directly to the agent:

```bash
> npx pr-shepherd iterate 123
# PR #123 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 3 passing, 0 skipped, 0 filtered, 0 inProgress · **remainingSeconds** 600 · **copilotReviewInProgress** false · **isDraft** false · **shouldCancel** false

## Review threads

### `PRRT_kwDOSGizTs58XB1L` — `src/commands/iterate.mts:42` (@alice)

> The variable name is misleading.
>
> Consider renaming `x` to `remainingSeconds` so readers don't have to
> trace back to the declaration to understand its meaning.

## Actionable comments

### `IC_kwDOSGizTs7_ajT8` (@bob)

> Consider using a more descriptive name here.

## Failing checks

- `24697658766` — `CI › lint / typecheck / test (22.x)`
  > Run tests

## Changes-requested reviews

- `PRR_kwDOSGizTs58XB1R` (@alice)

## Post-fix push

- base: `main`
- resolve: `npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_kwDOSGizTs58XB1L --minimize-comment-ids IC_kwDOSGizTs7_ajT8,IC_kwDOSGizTs7_ajT9 --dismiss-review-ids PRR_kwDOSGizTs58XB1R --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Fix the code
2. [Shown only if the branch is out of date] Rebase <DEFAULT BRANCH> if out of date
3. [If rebased] git push --force-with-lease [If not rebased] git push
4. Stop
```

On every iteration, a command is returned to instruct the agent exactly what to do. No guessing, no thinking:

```bash
`npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_kwDOSGizTs58XB1L --minimize-comment-ids IC_kwDOSGizTs7_ajT8,IC_kwDOSGizTs7_ajT9 --dismiss-review-ids PRR_kwDOSGizTs58XB1R --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`
```

## Why pr-shepherd

Concrete improvements to an agentic PR-review workflow:

- **Faster monitor loops** — one batched GraphQL query per tick (see [docs/graphql.md](docs/graphql.md)) instead of N REST round-trips
- **Lower context usage per iteration** — classification lives in the CLI; the agent receives one decision per tick and never sees raw GraphQL payloads or resolved threads
- **Prompt-cache friendly** — the 4-minute default tick is tuned to Claude's 5-minute prompt-cache TTL (tunable via `watch.interval`)
- **Reduced GitHub rate-limit exposure** — one batched GraphQL read per tick; loop-state files (fix-attempts, stall detection, ready-delay timer) are kept in `$TMPDIR/pr-shepherd-state/`
- **No MCP surface** — skills call the CLI via `npx`; no long-lived MCP server, no extra auth boundary, smaller reasoning surface
- **Skills over subagents** — skill prompts inject into the main conversation rather than spawning a subagent that reloads CLAUDE.md every turn
- **Safe to interrupt** — all state lives in the PR on GitHub; the cron loop self-terminates when the PR is merged, closed, or settles after ready-delay

## Design principles

- **Reduced agent context** — logic lives in the CLI, not the prompt
- **Reduced GitHub rate-limit exhaustion** — primary PR state is fetched via a batched GraphQL query
- **Fewer tool calls** — comment resolutions are batched; resolved threads never reach the agent
- **Skills over subagents** — subagents reload all CLAUDE.md context on every turn; skills inject into the main conversation instead, keeping cost low
- **JSON/text parity** — `--format=json` and `--format=text` carry equivalent information; every field in one has a representation in the other

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

### Without the plugin

See [docs/custom-commands.md](docs/custom-commands.md) for a project-local slash command that wraps the CLI without the plugin.

### As a global CLI

```bash
npm install -g pr-shepherd
```

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

Environment variables: `GH_TOKEN` / `GITHUB_TOKEN` (auth; falls back to `gh auth token`), `PR_SHEPHERD_STATE_DIR` (override loop-state base dir).

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
