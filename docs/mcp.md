# pr-shepherd MCP server

[← README](../README.md)

How to install and call `pr-shepherd-mcp`, the local stdio MCP server (no hosted HTTP endpoint), and the contract for every tool it registers.

The server shares command implementations, GitHub token resolution, and cascading `.pr-shepherdrc.yml` files with the CLI. Tools gather PR context (`iterate`, `stack`), apply deterministic GitHub mutations (`apply`), build checked suggestion patches (`suggest`), read Shepherd Journals (`extract_journal`, `get_journal`), and print playbooks (`playbook`). The calling client owns recurrence and any git mutations.

Transport follows `github.transport` or the per-call `transport: "auto"|"graphql"|"rest"` input, with the CLI's selection and fallback. REST results may omit GraphQL-only fields; those stay unknown, and unsupported operations are reported explicitly. See [api.md](api.md) and [github-api.md](github-api.md#transport-selection).

The binary ships in the `pr-shepherd` npm package; replace `<version>` with a published version.

```text
npx --yes --package pr-shepherd@<version> pr-shepherd-mcp
```

## Why the plugin does not start it

The plugin is the CLI plus skills. Up to v2.2.3 it also started this server; it no longer does, for these reasons:

- **The agent needs a shell anyway.** Most `[TRIAGE]` ticks end in a commit and a push, so an agent that can act on Shepherd's output can also run the CLI.
- **Waiting belongs in the background.** `pr-shepherd [PR] --until-terminal` runs as a background process; hosts that wake the agent on exit (Claude Code) resume it when the PR needs it, and hosts without wake-on-exit (Codex CLI) use the bounded poll ([cli-usage.md](cli-usage.md)). An MCP tool call blocks the agent's turn, so it cannot wait without stalling, and a tick-per-call loop costs a full GitHub fetch per call.
- **Streaming does not help.** SSE responses and MCP progress notifications are not shown to the model.
- **Almost all real use went through the CLI.** The tool definitions were loaded into every session for a rarely used fallback.

The server, its binary, and its tools stay supported. Register it yourself (below) for an MCP-only host.

## Install

Paths: the plugin (preferred in Claude Code, Codex, and Grok; skills that drive the CLI), the MCP server alone (below), or a local checkout when developing this repository.

The server needs no global CLI install. Confirm GitHub auth before the first tool call ([authentication.md](authentication.md)).

### Plugin

Install the plugin as described in [skills.md](skills.md); register the server below if you also want MCP. The `pr-shepherd` skill uses MCP `iterate` only when the CLI is unavailable and the server is registered, and MCP `apply` and `suggest` only when the tick used MCP `iterate`.

### MCP server only

Register the stdio command in any MCP client. Pin `@<version>` so the host does not float to a new release.

```bash
claude mcp add --transport stdio --scope user pr-shepherd -- \
  npx --yes --package pr-shepherd@<version> pr-shepherd-mcp
codex mcp add pr-shepherd -- \
  npx --yes --package pr-shepherd@<version> pr-shepherd-mcp
grok mcp add pr-shepherd -- \
  npx --yes --package pr-shepherd@<version> pr-shepherd-mcp
```

| Host        | Scope / config file                                                                                                                                                    | Confirm                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Claude Code | `--scope user` writes `~/.claude.json` (every project); `--scope project` writes `.mcp.json` in the repository; no `--scope` is a local (this-project, private) entry. | `claude mcp list` or `/mcp`                             |
| Codex       | Or add a table to `~/.codex/config.toml` (user) or `.codex/config.toml` (trusted project).                                                                             | `codex mcp list` or `/mcp`                              |
| Grok        | `--scope user` (default) writes `~/.grok/config.toml`; `--scope project` writes `.grok/config.toml` in the current directory.                                          | `grok mcp list`, `grok mcp doctor pr-shepherd`, `/mcps` |

Project `.mcp.json` (Claude Code) and TOML (Codex, Grok):

```json
{
  "mcpServers": {
    "pr-shepherd": {
      "command": "npx",
      "args": ["--yes", "--package", "pr-shepherd@<version>", "pr-shepherd-mcp"]
    }
  }
}
```

```toml
[mcp_servers.pr-shepherd]
command = "npx"
args = ["--yes", "--package", "pr-shepherd@<version>", "pr-shepherd-mcp"]
```

### Local checkout

After `npm install` (which builds `bin/`), `npx pr-shepherd-mcp` launches the checkout's server only while the current directory is this repository. In client config, store the built file by absolute path; a stored `npx pr-shepherd-mcp` would launch from the PR repo and miss this package's bin:

```bash
claude mcp add --transport stdio --scope user pr-shepherd -- \
  node /path/to/pr-shepherd/bin/mcp-stdio.mjs
codex mcp add pr-shepherd -- node /path/to/pr-shepherd/bin/mcp-stdio.mjs
grok mcp add pr-shepherd -- node /path/to/pr-shepherd/bin/mcp-stdio.mjs
```

Replace `/path/to/pr-shepherd` with the checkout's absolute path. A stale global `pr-shepherd-mcp` lacks unreleased tools; do not use it while developing.

## Tools

The server registers seven tools. Hosts may prefix names with the server name (`pr-shepherd__iterate` in Grok, `mcp__pr-shepherd__iterate` in some Claude setups); the names below are the registered ones.

| Tool              | CLI counterpart                                                                                             | Side effects                                                                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iterate`         | `pr-shepherd iterate` (one tick; no poll, no debounce)                                                      | One state-machine tick: review items, checks, merge state, and review-mutation arguments. With REST, attempts otherwise-eligible supported mutations when capability is omitted; GitHub decides. Never cancels runs. |
| `stack`           | `pr-shepherd stack --once`                                                                                  | One aggregate tick over the PR's native stack. Its only GitHub mutation is rule-driven auto-resolve. Never edits the worktree or git history.                                                                        |
| `apply`           | `apply merge`, `apply review`, `apply files`, `apply journal`, `apply check-blocker`, `apply queue-removal` | Explicit operations are attempted in order. Merge requires REST and returns `pending`/`enqueued`/`merged`/`failed`; unsupported REST operations are reported.                                                        |
| `playbook`        | `pr-shepherd playbook`                                                                                      | None; no GitHub I/O. Returns a bundled playbook by `name` (playbook name or file slug such as `create-a-pr`), or lists them with no name.                                                                            |
| `extract_journal` | `pr-shepherd journal extract` (from a `body` string, not a file)                                            | None; no file, stdin, GitHub, or Shepherd-log I/O.                                                                                                                                                                   |
| `get_journal`     | none                                                                                                        | Read-only fetch of the PR body through the selected transport; never writes it.                                                                                                                                      |
| `suggest`         | `pr-shepherd suggest`                                                                                       | None. Never edits the worktree or git history.                                                                                                                                                                       |

`admin clean` and `admin log-file` have no MCP tool.

### Selectors

Every PR-targeted call requires a repository-qualified selector: a PR URL such as `https://github.com/owner/repo/pull/123` or `owner/repo#123`. Bare numbers and omitted selectors are rejected. Single-PR tools and `stack` take `pr`; aggregate `iterate` takes `prs`; `extract_journal` takes only a Markdown body. The named repository is the GitHub target and may differ from the server's startup working directory (or an embedded factory's `cwd`), which stays the local git, configuration, and rules context.

### Output projection

Each result's Markdown `content` and `structuredContent` come from the same projection and carry equivalent information.

| Tool / selector                  | `structuredContent`                                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `iterate` with `pr`              | The CLI's lean `--format=json` projection of `IterateResult`, not the raw object (details below).                                  |
| `iterate` with `prs`             | The raw `PollSummaryResult`.                                                                                                       |
| `stack`                          | The lean stack overview the CLI prints as JSON; Markdown is rendered from the same projection.                                     |
| `apply`, `suggest`               | The raw result object, matching their CLI JSON output.                                                                             |
| `extract_journal`, `get_journal` | The same JSON in both channels.                                                                                                    |
| `playbook`                       | The result object. Markdown `content` is the playbook body for a named playbook, or a bullet list of names when `name` is omitted. |

The single-PR `iterate` projection omits trivial-default fields (including `state` when `OPEN` and `mergeStateStatus` when `CLEAN`, like the text header) and adds `readyDelayOverride` when `readyDelaySeconds` was supplied. Every action except `triage` and `cancel` gets a top-level `instructions` array; `triage` carries its steps under `triage.instructions`, and `cancel` has none. A clean PR whose ready-delay is still counting returns action `ready` with `remainingSeconds`. The full field contract lives in [actions.md](actions.md).

### Review workflow

1. Call `iterate` first.
2. Translate its `resolveCommand` / `resolveOnlyCommand` arguments into an `apply` `review_mutations` operation.
3. Use one `suggest` call for all marked suggestion threads, in displayed order.

Use `append_journal` only when the caller asks for it; direct apply honors that intent even when `viewerCanUpdate` is false. Journal reads do not depend on `iterate`.

### `iterate`

Supply exactly one of `pr` or `prs`. The call always runs one tick and returns `nextCheck` unless nothing remains to wait for ([cloud.md](cloud.md#nextcheck)).

| Input                 | Type                            | Meaning                                                                |
| --------------------- | ------------------------------- | ---------------------------------------------------------------------- |
| `pr`                  | GitHub PR URL or `owner/repo#N` | Selector: one PR to inspect.                                           |
| `prs`                 | qualified PR array              | Selector: non-empty explicit set from one repository.                  |
| `readyDelaySeconds`   | non-negative number             | Override the ready-delay window.                                       |
| `stallTimeoutSeconds` | non-negative number             | Override the one-PR or `stack` stall timeout.                          |
| `noAutoMarkReady`     | boolean                         | Disable automatic draft → ready.                                       |
| `merge`               | boolean                         | Shepherd to readiness and emit merge/queue commands.                   |
| `instructions`        | `inline` or `playbook`          | `triage` instruction style; default `iterate.instructions` (`inline`). |
| `transport`           | `auto`, `graphql`, or `rest`    | Override `github.transport` for this call.                             |

Aggregate commands return one compact summary tick whose only GitHub mutation is rule-driven [classification auto-resolve](actions.md#classification-auto-resolve), reported as `ruleAutoResolve` on the affected row or layer:

- **`prs`** keeps per-PR raw state, bounded check/review counts, routing hints, and `pollCommand`s in both channels.
- **`stack`** (the [`stack` tool](#stack)) projects each layer to `shepherded` (when true), mergeable or one blocker (open layers only), author, `owned` only when the caller listed its PRs (whole-stack ownership omits it), position, and the layer's own base branch. It also surfaces `stackMergeable` (when true), `nextAction`, and raw ancestry mismatches. One-PR sessions run only for layers marked `owned`.
- The compact tick reuses singular check/review classification but keeps no ready-delay state. Bounded overflow is surfaced as incomplete context, not as a permanent action.

### `stack`

Takes `refs`: one stack number (`owner/repo#N`), or the PRs of one stack (you own only those; a single PR owns only itself, and the iterate input `stackLayers` carries layer ownership to one-PR sessions). Refs spanning several stacks fail with the same per-stack commands the CLI prints. `merge` lands every owned layer together once all are ready, `mergeReady` lands the ready owned prefix, and `mergeThrough` lands up to that PR; the three are mutually exclusive. It also takes the same `readyDelaySeconds`, `stallTimeoutSeconds`, `noAutoMarkReady`, `merge`, `instructions`, and `transport` inputs as `iterate`. It runs one aggregate tick and returns `nextCheck` unless nothing remains to wait for.

### `apply`

| Input        | Type                            | Required | Meaning                                                                  |
| ------------ | ------------------------------- | -------- | ------------------------------------------------------------------------ |
| `pr`         | GitHub PR URL or `owner/repo#N` | yes      | PR shared by every operation; its named repository is the GitHub target. |
| `operations` | non-empty array                 | yes      | Run in this exact order, after every operation is validated.             |
| `transport`  | `auto`, `graphql`, or `rest`    | no       | Override `github.transport` for this call.                               |

Each operation is one of the following, discriminated by `type`.

**`merge`** — submit or resume a REST merge request.

| Field           | Type                                           | Required | Meaning                                                         |
| --------------- | ---------------------------------------------- | -------- | --------------------------------------------------------------- |
| `requireSha`    | string                                         | yes      | Full current lowercase head SHA                                 |
| `mergeAction`   | `"direct_merge"`, `"merge_queue"`, `"default"` | yes      | Direct merge, known queue, or let GitHub select                 |
| `mergeMethod`   | `"merge"`, `"squash"`, `"rebase"`              | no       | Valid only for `direct_merge`                                   |
| `expectedStack` | `{ number, baseRefName, prefix }`              | no       | Bind the observed native stack, trunk, and ordered lower prefix |

Each `expectedStack.prefix` entry carries `{ pr, headRefName, headRefOid, baseRefName }`; the final entry must match the requested PR and `requireSha`. Generated REST stack commands carry this guard, apply rejects missing membership or changed topology before submission, and the guard is persisted with request options. The result describes a `pending`, `enqueued`, `merged`, or `failed` outcome; pending and enqueued do not mean merged. See [merge validation and resume](api.md).

**`review_mutations`**

| Field                | Type         | Required                                                            |
| -------------------- | ------------ | ------------------------------------------------------------------- |
| `resolveThreadIds`   | string array | no                                                                  |
| `replyThreadIds`     | string array | no                                                                  |
| `minimizeCommentIds` | string array | no                                                                  |
| `dismissReviewIds`   | string array | no                                                                  |
| `message`            | string       | yes when replying or dismissing                                     |
| `requireSha`         | string       | no; `HEAD` (the server checkout's commit) or a full SHA to poll for |

A REST proxy session refusal stops the batch and any later operations. Both channels preserve successful IDs and the pending ID lists, with the proxy's message in `sessionRefusal`. Repair session access and retry only pending IDs; an unchanged item stays eligible because no denied marker is written. See [API partial review results](api.md).

**`acknowledge_queue_removal`** — record a validated local native-stack CI removal acknowledgment. GraphQL only; REST reports it as transport-unsupported.

| Field            | Type   | Required | Meaning                                         |
| ---------------- | ------ | -------- | ----------------------------------------------- |
| `requireSha`     | string | yes      | Full current head SHA                           |
| `queueCommitOid` | string | yes      | Full removed queue commit SHA                   |
| `removedAtUnix`  | number | yes      | Positive safe-integer Unix timestamp of removal |

It validates current GitHub evidence before writing local state and does not enqueue or merge. Fresh source CI and the one-PR READY receipt still precede aggregate stack recovery. The result contains `pr`, `repo`, and `acknowledgment` (`headSha`, `queueCommitOid`, `removedAtUnix`).

**`check_blocker`** — record or clear that a failing check is blocked on an external PR or issue, as `apply check-blocker` does.

| Field       | Type    | Required                 | Meaning                                               |
| ----------- | ------- | ------------------------ | ----------------------------------------------------- |
| `check`     | string  | yes                      | Exact check name                                      |
| `blockedBy` | string  | unless `clear` is `true` | PR/issue URL, `owner/repo#N`, or `issue:owner/repo#N` |
| `clear`     | boolean | no                       | Clear the recorded blocker for that check instead     |

The result carries `checkName` and, when recording, `blocker` and `recordedAt`.

**`mark_files_viewed`**

| Field           | Type         | Required | Meaning                                     |
| --------------- | ------------ | -------- | ------------------------------------------- |
| `files`         | string array | no       | Exact changed-file paths                    |
| `tests`         | boolean      | no       | Select changed test files                   |
| `matchPatterns` | string array | no       | Case-insensitive JavaScript regex selectors |

**`append_journal`**

| Field    | Type    | Required | Meaning                             |
| -------- | ------- | -------- | ----------------------------------- |
| `item`   | string  | yes      | Idempotent Shepherd Journal entry   |
| `dryRun` | boolean | no       | Preview without writing the PR body |

### `suggest`

| Input         | Type                            | Required | Meaning                                                            |
| ------------- | ------------------------------- | -------- | ------------------------------------------------------------------ |
| `pr`          | GitHub PR URL or `owner/repo#N` | yes      | PR for the suggestions; its named repository is the GitHub target. |
| `suggestions` | non-empty object array          | yes      | Ordered `{ threadId, message, description? }` suggestion requests. |
| `transport`   | `auto`, `graphql`, or `rest`    | no       | Override `github.transport` for this call.                         |

GitHub's anchored line range at the fetched PR head is authoritative. A clean local descendant is accepted only when the full ordered patch stream passes `git apply --check`; otherwise inspect the current source and reviewer intent manually.

The result includes ordered `patches[]` entries with thread, path, range, author, patch, files-to-stage, and commit metadata, plus shared `postActionInstructions`. Apply and commit each patch in order. Shepherd does not recommend a push or review mutation from this standalone result because it cannot verify those authorizations; use the originating iterate output for authorization-checked actions.

### `extract_journal`, `get_journal`, and `playbook`

| Tool              | Input                                                       | Behavior                                                                                |
| ----------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `extract_journal` | `{ "body": "<Markdown PR body>" }`                          | Calls the pure journal extractor directly, including for an empty body.                 |
| `get_journal`     | `{ "pr": "owner/repo#123" }` (or URL), optional `transport` | Fetches one PR body through the selected transport and passes it to the same extractor. |
| `playbook`        | `{ "name"?: string }`                                       | Returns one bundled playbook, or the list when `name` is omitted.                       |

Neither journal tool exposes the full PR body or node ID, and neither changes the `apply` `append_journal` operation. Both return the extraction object in both channels:

- `{ "ok": true, "journal": { "format": "details", "entries": ["- decision"] } }`
- `{ "ok": true, "journal": null }` when no journal exists
- `{ "ok": false, "error": "…" }` for malformed journal content

A malformed journal is a successful tool call carrying a typed parser result; invalid tool input and GitHub failures use the normal MCP error response.

## Recurrence

MCP clients own polling. There is no long-running poll tool, and `iterate` has no `--debounce`, so late comments and CI failures are not batched the way the shell poll batches them.

Client tool-call timeouts vary widely, and a local server cannot change them:

| Client                  | Default tool-call timeout                            | Notes                                                                                                                                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code CLI         | 30 min idle for stdio servers; about 27.8 h hard cap | The idle timer resets on a response or progress notification. Set `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` (ms, `0` disables) or a per-server `timeout`. The hard wall-clock cap (`1e8` ms) is `MCP_TOOL_TIMEOUT`, and progress does not extend it. `MCP_TIMEOUT` covers server startup. |
| Claude Desktop / Cowork | about 60 s                                           | The MCP TypeScript SDK default. Reports say the timeout setting is ignored there.                                                                                                                                                                                                   |
| Codex CLI               | 60 s                                                 | `tool_timeout_sec` per server.                                                                                                                                                                                                                                                      |
| Cursor                  | about 60 s                                           | In agent/ACP mode; not configurable.                                                                                                                                                                                                                                                |
| Cline                   | 60 s                                                 | Configurable per server from 30 s to 1 h.                                                                                                                                                                                                                                           |
| Gemini CLI              | 10 min                                               | `timeout` per server.                                                                                                                                                                                                                                                               |
| MCP TypeScript SDK      | 60 s per request                                     | Resetting the timeout on progress notifications is the caller's option.                                                                                                                                                                                                             |

Most hosts cut calls off at about 60 s, and a tool call blocks the agent's turn regardless of the limit. So no tool polls or sleeps. `iterate`, `stack`, and `suggest` each do one bounded fetch. `apply` runs its `operations` sequentially, each with GitHub I/O, so a large request on a slow GitHub can approach the timeout; a failure partway leaves earlier mutations applied. A returned `PartialApplyError` carries a `completed` list, which is the recovery path. A client timeout returns no such list, so check the PR's current state before retrying, because replaying the batch can repeat mutations.

1. Call `iterate` with a repository-qualified `pr`.
2. Follow the returned `## Instructions`.
3. For `WAIT` or `READY`, call `iterate` again on a PR event or at `nextCheck.at`; for `MARK_READY`, call it again immediately. Do not wait for CI with `gh pr checks`, `gh pr watch`, `gh run watch`, or equivalent GitHub MCP check waiters; fetching check logs is fine.
4. For `TRIAGE`, finish the code/review work, then call `iterate` immediately. Do not wait for CI to finish first.
5. For `MERGE`, run the returned command (and only the conditionally documented fallback), then call `iterate` immediately.
6. Stop on `CANCEL` or `ESCALATE`. For the `stack` tool, `SHEPHERD` means run the listed one-PR sessions and call `stack` again; human blockers may already be visible, but the command returns `ESCALATE` only after autonomous shepherding is exhausted.

The shell command `pr-shepherd [PR]` is the bounded poll dispatcher, not an MCP tool. See [skills.md](skills.md) and [cli-usage.md](cli-usage.md).

## Authentication, cwd, and environment

The startup working directory (or an embedded factory's `cwd`) supplies local git, cascading `.pr-shepherdrc.yml` files, classification rules, and per-worktree debug logging. An explicit `pr` changes only the GitHub target; PR-scoped state uses that repository and PR number.

| Setting                                 | Effect                                                                                                                                                                                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token                                   | Same order as the CLI: `GH_TOKEN`, `GITHUB_TOKEN`, `gh auth token`, then `GITHUB_PERSONAL_ACCESS_TOKEN`. See [authentication.md](authentication.md). A configured GitHub App overrides it for covered repositories: [github-app.md](github-app.md). |
| `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY` | Honored for either transport. In cloud sessions the proxy may replace a placeholder token, so local token validation is not authoritative. Keep TLS verification enabled; configure the proxy CA through Node's normal certificate settings.        |
| `PR_SHEPHERD_STATE_DIR`                 | Seen markers, stall files, ready-delay, and the debug log. Defaults to `<git-common-dir>/pr-shepherd-state` for cloud sessions; see [cloud.md](cloud.md#durable-state).                                                                             |
| `PR_SHEPHERD_LOG_DISABLED=1`            | Disable the per-worktree debug log. Print its path from a shell with `pr-shepherd admin log-file`.                                                                                                                                                  |

## Errors

Failed tool calls return `isError: true` instead of throwing across the transport.

- Validation errors use exit code `64` (`EX_USAGE`) and `details.validation: true`.
- Partial `apply` failures use the underlying command's exit code and include `details.failedIndex` plus redacted `details.completed`.
- Other failures map through the same [exit-codes.md](exit-codes.md) table as the CLI.

Token-like strings (`ghp_…`, `github_pat_…`, `Authorization: Bearer …`) are redacted in the error text and structured details.

## Embed the server

To run the server in process instead of spawning `pr-shepherd-mcp`, import the factory:

```ts
import { createPrShepherdMcpServer, runPrShepherdMcpStdio } from "pr-shepherd/mcp";

const server = createPrShepherdMcpServer({ cwd: "/path/to/repo" });
// or
await runPrShepherdMcpStdio({ cwd: "/path/to/repo" });
```

`createPrShepherdMcpServer` also accepts `transport` and an optional `shepherd` for tests or alternate transports, and exposes the same seven tools.

## Related docs

- [cli-usage.md](cli-usage.md) — shell commands that pair with these tools
- [skills.md](skills.md) — Claude Code, Codex, and Grok skill dispatch and recurrence
- [actions.md](actions.md) — iterate action contract
- [api.md](api.md) — embed `createPrShepherd` / `createPrShepherdMcpServer`
- [architecture.md](architecture.md) — `src/mcp/` module map
