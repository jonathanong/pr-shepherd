# pr-shepherd

Autonomous PR CI monitor and review-comment resolver for Claude Code.

## Goals

- **Reduced context** — shifts more logic to the CLI instead of the agent
- **Reduced GitHub rate limit exhaustion** — all GraphQL queries are batched
- **Reduced agent tool calls** — batching comment resolutions means fewer tool calls and less context used
- **No MCP** — less reasoning and much faster than using the GitHub MCP
- **CI cancellation on failure** — avoids wasted CI runs when actionable failures exist
- **Auto-resolution of all inline comments** — including bot and AI reviewer comments
- **Automatic resolution of outdated comments** — happens before the agent is involved
- **Automatic pagination and filtering** — resolved comments never reach the agent
- **Aggressively hides bot comments** — keeps PR noise low
- **Waits for pending Copilot reviews** — avoids premature marking as ready
- **Rebases on conflict** — automatically rebases on the PR base branch when there are merge conflicts
- **4-minute watch cadence** — keeps Claude's prompt cache warm (5-minute TTL)
- **10-minute settle window** — waits after the PR is clean before exiting, in case of pending reviews
- **Draft → ready-for-review** — automatically converts draft PRs when CI passes
- **Skips non-PR CI checks** — only `pull_request` / `pull_request_target` events count toward readiness
- **Intended as a PR merge blocker** — pair with a GitHub Actions required check that verifies all threads are resolved

## Why it's built this way

Claude's cloud autofix requires CI to verify changes for apps that can't run in the cloud. Running targeted tests locally and letting Claude Code drive is cheaper and avoids vendor lock-in. Skills are used (not subagents) because subagents load all CLAUDE.md context, increasing cost; skills inject into the main conversation instead.

## Install

```bash
npm install -g pr-shepherd
```

### As a Claude Code plugin

```bash
# Install from marketplace
claude /plugin marketplace add jonathanong/pr-shepherd
claude /plugin install pr-shepherd
```

Then use:
- `/pr-shepherd:monitor [PR]` — start continuous monitoring
- `/pr-shepherd:check [PR]` — one-shot status check
- `/pr-shepherd:resolve [PR]` — fetch, fix, and resolve review comments

## Workflow

```mermaid
flowchart TD
  U(["/pr-shepherd:monitor PR"]) --> SC["monitor skill"]
  SC -->|CronList| EX{Loop exists<br/>for this PR?}
  EX -->|yes| NOW[Run iterate once<br/>inline and act]
  EX -->|no| CREATE["/loop 4m --max-turns 50 --expires 8h"]
  CREATE --> CRON[(cron tick every 4m)]
  NOW --> ITER
  CRON --> ITER["pr-shepherd iterate PR --format=json"]

  ITER --> S1{1. last commit<br/>age &lt; cooldown?}
  S1 -->|yes| A_COOL([action: cooldown])
  S1 -->|no| S2["2. runCheck — one GraphQL batch<br/>classify + deriveMergeStatus<br/>+ autoResolveOutdated"]

  S2 --> S25{2.5 state != OPEN?}
  S25 -->|yes| A_CAN([action: cancel])
  S25 -->|no| S3["3. updateReadyDelay<br/>ready-since.txt"]
  S3 --> S3C{shouldCancel?}
  S3C -->|yes| A_CAN
  S3C -->|no| S4{4. CONFLICTS or actionable<br/>threads/comments/CI/reviews?}
  S4 -->|yes| S4X["gh run cancel actionable runIds"]
  S4X --> A_FIX([action: fix_code])
  S4 -->|no| S5{5. transient<br/>timeout/infra?}
  S5 -->|yes| S5X["gh run rerun runId --failed"]
  S5X --> A_RR([action: rerun_ci])
  S5 -->|no| S6{6. flaky + BEHIND?}
  S6 -->|yes| A_REB([action: rebase])
  S6 -->|no| S7{7. READY + CLEAN<br/>+ isDraft + !copilot?}
  S7 -->|yes| A_MR([action: mark_ready])
  S7 -->|no| A_W([action: wait])

  A_COOL --> DEC{skill acts on action}
  A_CAN --> DEC
  A_REB --> DEC
  A_FIX --> DEC
  A_RR --> DEC
  A_MR --> DEC
  A_W --> DEC

  DEC -->|cancel| STOP["/loop cancel"]
  DEC -->|rebase| REB["git fetch && rebase origin/BASE &&<br/>push --force-with-lease"]
  DEC -->|fix_code| FIX["Edit files → pr-shepherd postfix →<br/>git add + commit →<br/>fetch + rebase + push →<br/>pr-shepherd resolve --require-sha HEAD"]
  FIX --> NEXT[Wait for next tick]
  REB --> NEXT
  DEC -->|other| NEXT
  NEXT --> CRON
```

## CLI

```sh
pr-shepherd check [PR]                                # read-only PR status snapshot
pr-shepherd resolve [PR] [--fetch | --resolve-thread-ids …]
pr-shepherd iterate [PR] [--cooldown-seconds N] [--ready-delay Nm] [--last-push-time N]
pr-shepherd status PR1 [PR2 …]                        # multi-PR table
pr-shepherd postfix                                   # run configured postFixCommands
```

Common flags:

| Flag | Default | Description |
| --- | --- | --- |
| `--format text\|json` | `text` | Output format |
| `--no-cache` | false | Bypass the 5-minute file cache |
| `--cache-ttl N` | 300 | Cache TTL in seconds |
| `--ready-delay Nm` | `10m` | Settle window before loop exits |

## Configuration

Create a `.pr-shepherdrc.yml` in your project root (or any parent directory):

```yaml
postFixCommands:
  - npx oxlint --fix
  - npx oxfmt

commitMessage: 'fix: address review comments'

# baseBranch: null  # auto-detect from PR (default)
```

See [docs/configuration.md](docs/configuration.md) for all options.

## Requirements

- Node.js ≥ 24.0.0
- `gh` CLI authenticated (`gh auth login`)
- `git`

## Architecture

See [docs/architecture.md](docs/architecture.md) and [docs/](docs/) for full reference docs.

## Forking

If you want to customize pr-shepherd for your own use or team, see [docs/forking.md](docs/forking.md).

## License

[MIT](LICENSE)
