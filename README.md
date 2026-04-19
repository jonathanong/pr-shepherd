# pr-shepherd

Autonomous PR CI monitor and review-comment resolver for Claude Code.

## Design principles

- **Reduced agent context** — logic lives in the CLI, not the prompt
- **Reduced GitHub rate-limit exhaustion** — primary PR state is fetched via a batched GraphQL query
- **Fewer tool calls** — comment resolutions are batched; resolved threads never reach the agent
- **No MCP** — smaller reasoning surface, much faster than the GitHub MCP
- **No vendor lock-in** — runs against `gh` + `git`; no hosted service required
- **Skills over subagents** — subagents reload all CLAUDE.md context on every turn; skills inject into the main conversation instead, keeping cost low

## Features

- **CI handling** — cancels runs on actionable failures, reruns on transient/infra failures, skips non-PR trigger events
- **Comments** — resolves inline threads (including bot and AI reviewer comments), auto-resolves outdated threads before the agent sees them, aggressively hides bot comments, paginates and filters server-side
- **Readiness** — converts draft → ready-for-review when CI passes, waits for pending Copilot reviews, settles for a configurable window (default 10 min) before exiting
- **Rebases on conflict** — automatically rebases on the PR base branch when merge conflicts appear
- **Intended as a PR merge blocker** — pair with a GitHub Actions required check that verifies all threads are resolved

## Install

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

   - **Merge status** (`report.mergeStatus.status`): CLEAN | BEHIND | CONFLICTS | BLOCKED | UNSTABLE | DRAFT | UNKNOWN
   - **CI check results** (`report.checks`): passing count, failing names, in-progress names
   - **Unresolved review comments** (`report.threads.actionable` + `report.comments.actionable`): count + details
   ````

3. **Use it in Claude Code:**

   ```
   /pr-check
   /pr-check 42
   ```

For `monitor` and `resolve` custom commands, do **not** copy the
[`skills/`](skills/) files directly — those contain skill/plugin-specific
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

On each 4-minute tick: fetch PR state in one GraphQL batch → classify CI, comments, and merge status → take one action (fix code, rebase, rerun CI, mark ready, or wait). See [docs/flow.md](docs/flow.md) for the full decision tree.

## CLI

```sh
pr-shepherd check [PR]                                # read-only PR status snapshot
pr-shepherd resolve [PR] [--fetch | --resolve-thread-ids …]
pr-shepherd iterate [PR] [--cooldown-seconds N] [--ready-delay Nm] [--last-push-time N]
pr-shepherd status PR1 [PR2 …]                        # multi-PR table
```

Common flags:

| Flag                  | Default | Description                     |
| --------------------- | ------- | ------------------------------- |
| `--format text\|json` | `text`  | Output format                   |
| `--no-cache`          | false   | Bypass the 5-minute file cache  |
| `--cache-ttl N`       | 300     | Cache TTL in seconds            |
| `--ready-delay Nm`    | `10m`   | Settle window before loop exits |

## Configuration

Create a `.pr-shepherdrc.yml` in your project root (or any parent directory) to override defaults:

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

See [docs/configuration.md](docs/configuration.md) for all options.

## Requirements

- Node.js ≥ 24.0.0
- `gh` CLI authenticated (`gh auth login`); `repo` scope is required for private repositories (public repositories may not need it)
- `git`

## Docs

Full reference: [docs/README.md](docs/README.md) — CLI usage, skills, configuration, architecture, actions, debugging, and more.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the module map and dependency rules.

## Forking

See [docs/forking.md](docs/forking.md) if you want to customize pr-shepherd for your own use or team.

## License

[MIT](LICENSE)
