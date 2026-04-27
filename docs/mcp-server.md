# MCP Server (`pr-shepherd-mcp`)

`pr-shepherd-mcp` is a long-lived MCP server that exposes all pr-shepherd CLI commands as MCP tools and optionally receives GitHub webhook events to push PR activity notifications to the connected Claude Code session.

## Why an MCP server?

The CLI is pull-based — Claude Code calls `npx pr-shepherd` each time it wants data. The MCP server adds two things the CLI cannot do:

1. **Direct tool calls** — Claude Code can call `shepherd_check`, `shepherd_iterate`, etc. without spawning a subprocess.
2. **Push notifications** — The MCP server runs a webhook HTTP endpoint. When GitHub sends a PR event, the server immediately notifies the connected session via an MCP logging notification (`notifications/message` with `method: logging`) containing a `<github-webhook-activity>` block.

## Setup

### 1. Configure Claude Code

Add to your Claude Code MCP config (e.g. `~/.claude.json` or `.claude/settings.json`):

```json
{
  "mcpServers": {
    "pr-shepherd": {
      "command": "npx",
      "args": ["pr-shepherd-mcp"],
      "env": {
        "GH_TOKEN": "ghp_...",
        "SHEPHERD_WEBHOOK_PORT": "3000",
        "GITHUB_WEBHOOK_SECRET": "your-secret"
      }
    }
  }
}
```

### 2. Set up the GitHub webhook

In your repository's Settings → Webhooks → Add webhook:

- **Payload URL**: `http://your-host:3000/webhook`
- **Content type**: `application/json`
- **Secret**: value of `GITHUB_WEBHOOK_SECRET`
- **Events**: Push, Pull request, Pull request review, Check suite, Check run

### 3. Subscribe to PR events

Once a session is active, subscribe to a PR so webhook events are forwarded:

```
Call shepherd_subscribe_pr with { prNumber: 123 }
```

Events for PR #123 will then appear as `<github-webhook-activity>` notifications in the session.

## Environment variables

| Variable                    | Default | Description                                                                 |
| --------------------------- | ------- | --------------------------------------------------------------------------- |
| `SHEPHERD_WEBHOOK_PORT`     | `3000`  | HTTP port for the webhook endpoint. Set to `0` to disable.                  |
| `GITHUB_WEBHOOK_SECRET`     | —       | HMAC secret for `X-Hub-Signature-256` validation. Optional but recommended. |
| `GH_TOKEN` / `GITHUB_TOKEN` | —       | GitHub API token. Required for all tool calls.                              |

## Webhook notification format

When a webhook event arrives for a subscribed PR, the session receives:

```
<github-webhook-activity>
event: pull_request
action: synchronize
pr: 123
repo: owner/repo
ref: refs/heads/feature-branch
sha: abc123def456
actor: username
timestamp: 2026-04-27T12:00:00Z
</github-webhook-activity>
```

Fields `action`, `ref`, `sha`, and `actor` are omitted when not present in the GitHub payload.

## Tool reference

All tools return plain text output identical to the corresponding CLI command's `--format=text` output. Tools return `isError: true` when the underlying command fails.

### `shepherd_check`

Get a PR status snapshot.

| Input        | Type    | Required | Description                                              |
| ------------ | ------- | -------- | -------------------------------------------------------- |
| `prNumber`   | number  | no       | PR number (auto-detected from current branch if omitted) |
| `skipTriage` | boolean | no       | Skip fetching job info and log tails for failing checks  |

### `shepherd_resolve_fetch`

Fetch actionable review threads and comments. Auto-resolves outdated threads and surfaces first-look items with instructions.

| Input      | Type   | Required | Description |
| ---------- | ------ | -------- | ----------- |
| `prNumber` | number | no       | PR number   |

### `shepherd_resolve_mutate`

Resolve, minimize, or dismiss review items by ID.

| Input                | Type     | Required | Description                                                 |
| -------------------- | -------- | -------- | ----------------------------------------------------------- |
| `prNumber`           | number   | no       | PR number                                                   |
| `resolveThreadIds`   | string[] | no       | Thread node IDs to resolve                                  |
| `minimizeCommentIds` | string[] | no       | Comment node IDs to minimize                                |
| `dismissReviewIds`   | string[] | no       | Review node IDs to dismiss                                  |
| `dismissMessage`     | string   | no       | Required when dismissing reviews                            |
| `requireSha`         | string   | no       | Wait for GitHub to receive this commit SHA before resolving |

### `shepherd_commit_suggestion`

Apply a suggestion block from a review thread and create a git commit.

| Input         | Type    | Required | Description                               |
| ------------- | ------- | -------- | ----------------------------------------- |
| `threadId`    | string  | **yes**  | Review thread node ID                     |
| `prNumber`    | number  | no       | PR number                                 |
| `message`     | string  | no       | Commit message (required unless `dryRun`) |
| `description` | string  | no       | Extended commit description               |
| `dryRun`      | boolean | no       | Validate patch without applying           |

### `shepherd_iterate`

Run one iterate cycle and return the next action (`fix_code`, `wait`, `mark_ready`, `cancel`, or `escalate`) with instructions.

| Input                    | Type    | Required | Description                              |
| ------------------------ | ------- | -------- | ---------------------------------------- |
| `prNumber`               | number  | no       | PR number                                |
| `cooldownSeconds`        | number  | no       | Min seconds between code changes         |
| `readyDelaySeconds`      | number  | no       | Delay before marking ready               |
| `stallTimeoutSeconds`    | number  | no       | Abort if no progress after N seconds     |
| `noAutoMarkReady`        | boolean | no       | Disable draft → ready transition         |
| `noAutoCancelActionable` | boolean | no       | Disable auto-cancel of actionable checks |

### `shepherd_monitor`

Get the `/loop` arguments and prompt body to bootstrap continuous monitoring.

| Input              | Type   | Required | Description                        |
| ------------------ | ------ | -------- | ---------------------------------- |
| `prNumber`         | number | no       | PR number                          |
| `readyDelaySuffix` | string | no       | Ready-delay duration, e.g. `"15m"` |

### `shepherd_status`

Get a status table for one or more PRs.

| Input       | Type     | Required | Description                 |
| ----------- | -------- | -------- | --------------------------- |
| `prNumbers` | number[] | **yes**  | PR numbers to check (min 1) |

### `shepherd_log_file`

Return the path to the per-worktree debug log file. No inputs.

### `shepherd_subscribe_pr`

Subscribe the current session to GitHub webhook events for a PR.

| Input      | Type   | Required | Description        |
| ---------- | ------ | -------- | ------------------ |
| `prNumber` | number | **yes**  | PR to subscribe to |

### `shepherd_unsubscribe_pr`

Stop forwarding webhook events for a PR to this session.

| Input      | Type   | Required | Description            |
| ---------- | ------ | -------- | ---------------------- |
| `prNumber` | number | **yes**  | PR to unsubscribe from |

## Differences from CLI

|                    | CLI (`npx pr-shepherd`)    | MCP server (`pr-shepherd-mcp`)        |
| ------------------ | -------------------------- | ------------------------------------- |
| Process model      | Short-lived per invocation | Long-lived, persistent connection     |
| Invocation         | Bash subprocess            | Direct MCP tool call                  |
| Webhook support    | None                       | HTTP endpoint + push notifications    |
| Subscription state | None                       | Per-process in-memory set             |
| `setupLog()`       | Yes (stdout tee)           | No (stdout reserved for MCP protocol) |
