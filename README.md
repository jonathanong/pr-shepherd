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

> **Note:** All install methods add the skill definitions only — they do not install the `pr-shepherd` CLI. The skills invoke `npx pr-shepherd`, so you also need the CLI available. Add it to your project's dev dependencies so `npx` resolves it without prompting:
>
> ```bash
> npm install --save-dev pr-shepherd
> ```
>
> Or install globally: `npm i -g pr-shepherd`.

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

Common flags (all subcommands):

| Flag                  | Default | Description                                                                    |
| --------------------- | ------- | ------------------------------------------------------------------------------ |
| `--format text\|json` | `text`  | Output format                                                                  |
| `--no-cache`          | false   | Bypass the 5-minute file cache                                                 |
| `--cache-ttl N`       | `300`   | Cache TTL in seconds; `PR_SHEPHERD_CACHE_TTL_SECONDS` env var takes precedence |

### pr-shepherd check [PR]

Read-only PR status snapshot. Fetches CI results, merge state, and review comments in one GraphQL batch. PR number is inferred from the current branch when omitted.

```sh
pr-shepherd check           # infer PR from current branch
pr-shepherd check 42
pr-shepherd check 42 --format=json
pr-shepherd check 42 --no-cache
```

Exit codes: `0` READY · `2` IN_PROGRESS · `3` UNRESOLVED_COMMENTS · `1` all other statuses

**Example output:**

```
PR #42 — owner/repo
Status: UNRESOLVED_COMMENTS

Merge Status: CLEAN
  mergeStateStatus:       CLEAN
  mergeable:              MERGEABLE
  reviewDecision:         APPROVED
  isDraft:                false
  copilotReviewInProgress:false

CI Checks: 3/3 passed

Actionable Review Threads (1):
  - threadId=RT_kwDOBxyz123 src/api.ts:47 (@reviewer)
    Please add error handling here

Summary: 1 actionable item(s) remaining
```

### pr-shepherd resolve [PR]

Two modes: **fetch** (default) auto-resolves outdated threads and returns actionable items; **mutate** resolves/minimizes/dismisses specific IDs after you push fixes.

**Fetch mode:**

```sh
pr-shepherd resolve           # fetch + auto-resolve outdated threads
pr-shepherd resolve 42 --fetch --format=json
```

```
Actionable Review Threads (2):
  - threadId=RT_kwDOabc src/api.ts:47 (@reviewer): Please add error handling here
  - threadId=RT_kwDOdef src/utils.ts:12 (@bot): Consider using a const here

Summary: 2 actionable item(s)
```

**Mutate mode** (after pushing fixes):

```sh
pr-shepherd resolve 42 \
  --resolve-thread-ids RT_kwDOabc,RT_kwDOdef \
  --minimize-comment-ids IC_kwDOxyz \
  --dismiss-review-ids PRR_kwDO123 \
  --message "Addressed in $(git rev-parse HEAD)" \
  --require-sha $(git rev-parse HEAD)
```

```
Resolved threads (2): RT_kwDOabc, RT_kwDOdef
Minimized comments (1): IC_kwDOxyz
Dismissed reviews (1): PRR_kwDO123
```

`--require-sha` polls GitHub until the PR head matches the SHA before mutating — ensures reviewers see the fix before threads are closed. Exit code: always `0`.

### pr-shepherd iterate [PR]

One monitor tick: classifies current PR state and emits a single action. Used by the cron loop; the monitor skill calls this every 4 minutes and acts on the result. See [docs/iterate-flow.md](docs/iterate-flow.md) for the full decision tree.

```sh
pr-shepherd iterate 42 --no-cache --format=json \
  --ready-delay 10m \
  --last-push-time "$(git log -1 --format=%ct HEAD)"
```

Flags:

| Flag                          | Default | Description                                       |
| ----------------------------- | ------- | ------------------------------------------------- |
| `--ready-delay Nm`            | `10m`   | Settle window before the loop cancels after READY |
| `--cooldown-seconds N`        | `30`    | Wait after a push before reading CI               |
| `--last-push-time N`          | —       | Unix timestamp hint embedded in the result        |
| `--no-auto-rerun`             | false   | Return `wait` instead of rerunning transient CI   |
| `--no-auto-mark-ready`        | false   | Skip converting draft → ready-for-review          |
| `--no-auto-cancel-actionable` | false   | Skip cancelling actionable failing runs           |

**Text output** (one line per action):

```
PR #42 [COOLDOWN] status=UNKNOWN merge=UNKNOWN (cooldown: CI still starting)
PR #42 [WAIT] status=READY merge=CLEAN (540s until cancel)
PR #42 [RERUN_CI] status=FAILING merge=UNSTABLE reran=12345,67890
PR #42 [FIX_CODE] status=UNRESOLVED_COMMENTS merge=BLOCKED threads=2 comments=0 checks=1 cancelled=1
PR #42 [REBASE] status=FAILING merge=BEHIND (branch is behind main)
PR #42 [MARK_READY] status=READY merge=CLEAN markedReady=true
PR #42 [CANCEL] status=READY merge=CLEAN (ready-delay elapsed)
PR #42 [ESCALATE] status=UNRESOLVED_COMMENTS merge=BLOCKED triggers=fix-thrash — Same thread(s) attempted multiple times without resolution — fix manually then rerun /pr-shepherd:monitor
```

**JSON output** (`--format=json`, compact single line):

```json
{
  "pr": 42,
  "repo": "owner/repo",
  "status": "READY",
  "state": "OPEN",
  "mergeStateStatus": "CLEAN",
  "copilotReviewInProgress": false,
  "isDraft": false,
  "shouldCancel": false,
  "remainingSeconds": 540,
  "summary": { "passing": 3, "skipped": 0, "filtered": 0, "inProgress": 0 },
  "action": "wait"
}
```

Exit codes: `0` wait/cooldown/rerun_ci/mark_ready · `1` fix_code/rebase · `2` cancel · `3` escalate

### pr-shepherd status PR1 [PR2 …]

Multi-PR summary table. One lightweight GraphQL query per PR, run in parallel.

```sh
pr-shepherd status 41 42 43
pr-shepherd status 100 --format=json
```

```

# owner/repo — PR status (3)

PR #41    Add new feature for user authentication           READY        SUCCESS
PR #42    Refactor internal module                          IN PROGRESS  PENDING
PR #43    Fix edge case in parser                           BLOCKED      SUCCESS (threads truncated — run shepherd check for full count)
```

Exit code: `0` if every PR is READY, `1` otherwise.

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

- Node.js ≥ 22.0.0
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
