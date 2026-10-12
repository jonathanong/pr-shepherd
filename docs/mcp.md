# pr-shepherd MCP server

[← README](../README.md)

How to install and call `pr-shepherd-mcp`, the local stdio MCP server, plus the contract for every tool it registers. For people wiring Shepherd into Claude Code, Codex, Grok, or another MCP client, and for agents calling the tools.

The server shares command implementations, GitHub token resolution, and cascading `.pr-shepherdrc.yml` files with the CLI. Tools gather PR context (`iterate`), apply deterministic GitHub mutations (`apply`), build checked suggestion patches (`build_suggestion_patches`), read Shepherd Journals (`extract_journal`, `get_journal`), and print playbooks (`playbook`). The calling client owns recurrence and any git mutations.

GitHub transport follows `github.transport` or the per-call `transport: "auto"|"graphql"|"rest"` input, with the same `auto` selection and fallback as the CLI. REST results may omit GraphQL-only fields; unavailable context stays unknown, and unsupported operations are reported explicitly. See [api.md](api.md) and [github-api.md](github-api.md#transport-selection).

The published binary is `pr-shepherd-mcp` from the `pr-shepherd` npm package. Replace `<version>` with a published version (the shipped plugin files pin the same version as `package.json`). The server speaks stdio only; there is no hosted HTTP endpoint.

```text
npx --yes --package pr-shepherd@<version> pr-shepherd-mcp
```

## Install

| Path            | When                                                                             |
| --------------- | -------------------------------------------------------------------------------- |
| Plugin          | Preferred in Claude Code, Codex, and Grok: skills plus a version-matched server. |
| MCP server only | Register `pr-shepherd-mcp` in the host when you do not want the plugin.          |
| Local checkout  | Developing this repository.                                                      |

The MCP server does not require a global CLI install; install the `pr-shepherd` CLI separately only for the shell interface. Confirm GitHub auth before the first tool call ([authentication.md](authentication.md)).

### Plugin

The plugin launches the server from `plugins/pr-shepherd/.mcp.json` (Claude Code and Grok) or `plugins/pr-shepherd/.codex.mcp.json` (Codex). The shipped `pr-shepherd` skill runs the poll command `pr-shepherd` and uses MCP `iterate` only when the CLI is unavailable. After a CLI poll, run the printed apply command; use MCP `apply` / `build_suggestion_patches` only when this tick used MCP `iterate`.

| Host        | Install                                                                                                                      | Confirm                                                 | Invoke                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Claude Code | `claude /plugin marketplace add jonathanong/pr-shepherd` then `claude /plugin install pr-shepherd`                           | `/mcp`                                                  | `/goal /pr-shepherd:pr-shepherd [42]`                                            |
| Codex       | `codex plugin marketplace add jonathanong/pr-shepherd` (optionally `--ref main`), then install/enable `pr-shepherd` in Codex | `/mcp`                                                  | `/goal $pr-shepherd [42]`                                                        |
| Grok        | `grok plugin marketplace add jonathanong/pr-shepherd` then `grok plugin install pr-shepherd --trust`                         | `grok mcp list`, `grok mcp doctor pr-shepherd`, `/mcps` | `/pr-shepherd` or `/pr-shepherd:pr-shepherd`, optionally with a PR number or URL |

- **Codex local checkout:** `git clone https://github.com/jonathanong/pr-shepherd ~/.codex/plugin-sources/pr-shepherd`, then `codex plugin marketplace add ~/.codex/plugin-sources/pr-shepherd`. The marketplace root must contain `.agents/plugins/marketplace.json` and `plugins/pr-shepherd/`.
- **Grok trust:** Grok starts a plugin's MCP server only after the plugin is trusted; `--trust` grants that. Plugins under `~/.grok/plugins/` are trusted automatically; project plugins require trust.

### MCP server only

Register the same stdio command in any MCP client. Pin `@<version>` so the host does not float to an unexpected release.

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

After `npm install` (which builds `bin/`), `npx pr-shepherd-mcp` launches the checkout's server, but only while the current directory is this repository. Persist the built file in client config with an absolute path instead; a stored `npx pr-shepherd-mcp` later launches from the PR repo and will not see this package's self-bin:

```bash
claude mcp add --transport stdio --scope user pr-shepherd -- \
  node /path/to/pr-shepherd/bin/mcp-stdio.mjs
codex mcp add pr-shepherd -- node /path/to/pr-shepherd/bin/mcp-stdio.mjs
grok mcp add pr-shepherd -- node /path/to/pr-shepherd/bin/mcp-stdio.mjs
```

Replace `/path/to/pr-shepherd` with this checkout's absolute path. Do not use a globally installed `pr-shepherd-mcp` while developing this repo; a stale global binary will not include unreleased tools.

## Tools

The server registers six canonical tools plus a deprecated singular suggestion adapter. Hosts namespace tool names with the server name (`pr-shepherd__iterate` in Grok, `mcp__pr-shepherd__iterate` in some Claude setups); the names below are the server-registered ones.

| Tool                       | CLI counterpart                                                                      | Side effects                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iterate`                  | `pr-shepherd iterate` (one tick; no poll, no debounce)                               | One state-machine tick: review items, checks, merge state, and review-mutation arguments. With REST, attempts otherwise-eligible supported mutations when capability is omitted; GitHub decides. Never cancels runs. |
| `apply`                    | `apply merge`, `apply review`, `apply files`, `apply journal`, `apply queue-removal` | Explicit operations are attempted in order. Merge requires REST and returns `pending`/`enqueued`/`merged`/`failed`; unsupported REST operations are reported.                                                        |
| `playbook`                 | `pr-shepherd playbook`                                                               | None; no GitHub I/O. Returns a bundled playbook by `name`, or lists them with no name.                                                                                                                               |
| `extract_journal`          | `pr-shepherd journal extract` (from a `body` string, not a file)                     | None; no file, stdin, GitHub, or Shepherd-log I/O.                                                                                                                                                                   |
| `get_journal`              | none                                                                                 | Read-only fetch of the PR body through the selected transport; never writes it.                                                                                                                                      |
| `build_suggestion_patches` | `pr-shepherd build-suggestion-patches`                                               | None. Never edits the worktree or git history.                                                                                                                                                                       |
| `build_suggestion_patch`   | deprecated `build-suggestion-patch`                                                  | Deprecated one-item adapter; use `build_suggestion_patches` with a one-item `suggestions` array.                                                                                                                     |

`admin clean` and `admin log-file` have no MCP tool.

### Selectors

Every PR-targeted call requires a repository-qualified selector: a GitHub PR URL such as `https://github.com/owner/repo/pull/123` or an `owner/repo#123` reference. Bare PR numbers and omitted selectors are rejected. Singular PR tools require `pr`; aggregate `iterate` accepts `prs` or `stack`; `extract_journal` takes only a Markdown body. The named repository is the GitHub target and may differ from the server's startup working directory (or an embedded factory's `cwd`), which remains the local git/configuration/rules context.

### Output projection

Each result has Markdown `content` and `structuredContent` produced from the same projection, so the two channels carry equivalent information.

| Tool / selector                                               | `structuredContent`                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `iterate` with `pr`                                           | The CLI's lean `--format=json` projection of `IterateResult`, not the raw object (details below). |
| `iterate` with `prs`                                          | The raw `PollSummaryResult`.                                                                      |
| `iterate` with `stack`                                        | The lean stack overview the CLI prints as JSON; Markdown is rendered from the same projection.    |
| `apply`, `build_suggestion_patches`, `build_suggestion_patch` | The raw result object, matching their CLI JSON output.                                            |
| `extract_journal`, `get_journal`, `playbook`                  | The same JSON in both channels.                                                                   |

The single-PR `iterate` projection omits trivial-default fields (including `state` when `OPEN` and `mergeStateStatus` when `CLEAN`, like the text header) and adds `readyDelayOverride` when `readyDelaySeconds` was supplied. Every action except `fix_code` and `cancel` gets a computed top-level `instructions` array; `fix_code` carries its steps under `fix.instructions`, and `cancel` has none. A clean PR whose ready-delay is still counting returns action `ready` with `remainingSeconds`. Action semantics, instruction text, and the full field contract live in [actions.md](actions.md).

### Review workflow

1. Call `iterate` first.
2. Translate its `resolveCommand` / `resolveOnlyCommand` arguments into an `apply` `review_mutations` operation.
3. Use one `build_suggestion_patches` call for all marked suggestion threads, in displayed order.

`mark_files_viewed` performs the requested viewed-state mutations and reports GitHub's results. Use `append_journal` only when the caller asks for that mutation; direct apply honors that explicit intent even when `viewerCanUpdate` is false. Journal reads are independent of `iterate`.

### `iterate`

Supply exactly one of `pr`, `prs`, or `stack`.

| Input                    | Type                            | Meaning                                                                                                                     |
| ------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pr`                     | GitHub PR URL or `owner/repo#N` | Selector: one PR to inspect.                                                                                                |
| `prs`                    | qualified PR array              | Selector: non-empty explicit set from one repository.                                                                       |
| `stack`                  | GitHub PR URL or `owner/repo#N` | Selector: anchor of its complete native GitHub stack.                                                                       |
| `readyDelaySeconds`      | non-negative number             | Override the ready-delay window.                                                                                            |
| `stallTimeoutSeconds`    | non-negative number             | Override the one-PR or `stack` stall timeout.                                                                               |
| `noAutoMarkReady`        | boolean                         | Disable automatic draft → ready.                                                                                            |
| `merge`                  | boolean                         | Shepherd to readiness and emit merge/queue commands.                                                                        |
| `instructions`           | `inline` or `playbook`          | `fix_code` instruction style; default `iterate.instructions` (`inline`).                                                    |
| `pollMode`               | `auto`, `poll`, or `event`      | Event mode adds `pollMode` and `nextCheck` and event-mode instruction steps; default `poll.mode`. See [cloud.md](cloud.md). |
| `transport`              | `auto`, `graphql`, or `rest`    | Override `github.transport` for this call.                                                                                  |
| `noAutoCancelActionable` | boolean                         | Deprecated no-op; Shepherd never cancels workflow runs.                                                                     |
| `neverCancelRuns`        | string array                    | Deprecated per-call no-op retained for compatibility.                                                                       |

Aggregate selectors return one compact, read-only summary tick:

- **`prs`** keeps per-PR raw state, bounded check/review counts, routing hints, and `pollCommand`s in both channels.
- **`stack`** projects each layer to `shepherded` (when true), mergeable or one blocker (open layers only), author, `owned` when that author matches the viewer, position, and the layer's own base branch. It also surfaces `stackMergeable` (when true), `nextAction`, and raw ancestry mismatches. One-PR sessions run only for layers marked `owned`.
- The compact tick reuses singular check/review classification but does not maintain ready-delay state. Bounded overflow is surfaced as incomplete context without becoming a permanent action by itself.

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

**`mark_files_viewed`**

| Field           | Type         | Required | Meaning                   |
| --------------- | ------------ | -------- | ------------------------- |
| `files`         | string array | no       | Exact changed-file paths  |
| `tests`         | boolean      | no       | Select changed test files |
| `matchPatterns` | string array | no       | Glob/regex selectors      |

**`append_journal`**

| Field    | Type    | Required | Meaning                             |
| -------- | ------- | -------- | ----------------------------------- |
| `item`   | string  | yes      | Idempotent Shepherd Journal entry   |
| `dryRun` | boolean | no       | Preview without writing the PR body |

### `build_suggestion_patches`

| Input         | Type                            | Required | Meaning                                                            |
| ------------- | ------------------------------- | -------- | ------------------------------------------------------------------ |
| `pr`          | GitHub PR URL or `owner/repo#N` | yes      | PR for the suggestions; its named repository is the GitHub target. |
| `suggestions` | non-empty object array          | yes      | Ordered `{ threadId, message, description? }` suggestion requests. |
| `transport`   | `auto`, `graphql`, or `rest`    | no       | Override `github.transport` for this call.                         |

GitHub's anchored line range at the fetched PR head is authoritative. A clean local descendant is accepted only when the full ordered patch stream passes `git apply --check`; otherwise inspect the current source and reviewer intent manually.

The result includes ordered `patches[]` entries with thread, path, range, author, patch, files-to-stage, and commit metadata, plus shared `postActionInstructions`. Apply and commit each patch in order. Shepherd does not recommend a push or review mutation from this standalone result because it cannot verify those authorizations; use the originating iterate output for authorization-checked actions. `build_suggestion_patch` takes the same inputs for one suggestion.

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

MCP clients own polling; there is no long-running poll tool, and `iterate` has no `--debounce`, so late comments and CI failures are not batched the way the shell poll dispatcher batches them.

This is a client-side constraint a local server cannot get around:

| Host / layer       | Tool-call timeout                                                                                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP TypeScript SDK | 60s default per request (`DEFAULT_REQUEST_TIMEOUT_MSEC`). A server may send `notifications/progress`, but resetting the timeout on progress (`resetTimeoutOnProgress`) is the caller's option, not the server's.                                      |
| Claude Code        | Open issue `anthropics/claude-code#58687`: long calls time out even with correct progress notifications. No stable variable guarantees a longer timeout (`MCP_TIMEOUT` covers server startup only; `MCP_TOOL_TIMEOUT` support has been inconsistent). |
| Codex CLI          | Same 60s default; users can raise `tool_timeout_sec`.                                                                                                                                                                                                 |
| Grok CLI           | Unconfirmed.                                                                                                                                                                                                                                          |

A tool that sleeps across ticks would risk that ceiling on at least two of three plugin hosts, so no tool intentionally polls or sleeps. `iterate` and `build_suggestion_patches` each do one bounded fetch over the selected transport. `apply` awaits its `operations` sequentially, each with GitHub I/O, so a large request against a slow GitHub can still approach the timeout; a failure partway through leaves earlier mutations applied without the client seeing a response, and `PartialApplyError`'s `completed` list is the recovery path.

1. Call `iterate` with a repository-qualified `pr`.
2. Follow the returned `## Instructions`.
3. For `WAIT` or `MARK_READY`, call `iterate` again when the host is ready to recheck. Do not wait for CI with `gh pr checks`, `gh pr watch`, `gh run watch`, or equivalent GitHub MCP check waiters; fetching check logs is fine.
4. For `FIX_CODE`, finish the code/review work, then call `iterate` immediately. Do not wait for CI to finish first.
5. For `MERGE`, run the returned command (and only the conditionally documented fallback), then call `iterate` immediately.
6. Stop on `CANCEL` or `ESCALATE`. For a native-stack selector, `SHEPHERD` means run the listed one-PR sessions and select the stack again; human blockers may already be visible, but the selector returns `ESCALATE` only after autonomous shepherding is exhausted.

The shell command `pr-shepherd [PR]` is the bounded poll dispatcher, not an MCP tool. See [skills.md](skills.md) and [cli-usage.md](cli-usage.md).

## Authentication, cwd, and environment

The server uses its startup working directory (or an embedded factory's `cwd`) for local git, cascading `.pr-shepherdrc.yml` files, classification rules, and per-worktree debug logging. An explicit `pr` changes only the GitHub target. PR-scoped state uses the explicit target repository and PR number.

| Setting                                 | Effect                                                                                                                                                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token                                   | Same order as the CLI: `GH_TOKEN`, `GITHUB_TOKEN`, `gh auth token`, then `GITHUB_PERSONAL_ACCESS_TOKEN`. See [authentication.md](authentication.md).                                                                                         |
| `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY` | Honored for either transport. In cloud sessions the proxy may replace a placeholder token, so local token validation is not authoritative. Keep TLS verification enabled; configure the proxy CA through Node's normal certificate settings. |
| `PR_SHEPHERD_STATE_DIR`                 | Seen markers, stall files, ready-delay, and the debug log. Defaults to `<git-common-dir>/pr-shepherd-state` for cloud sessions; see [cloud.md](cloud.md#durable-state).                                                                      |
| `PR_SHEPHERD_LOG_DISABLED=1`            | Disable the per-worktree debug log. Print its path from a shell with `pr-shepherd admin log-file`.                                                                                                                                           |

## Errors

Failed tool calls return `isError: true` instead of throwing across the transport.

- Validation errors use exit code `64` (`EX_USAGE`) and `details.validation: true`.
- Partial `apply` failures use the underlying command's exit code and include `details.failedIndex` plus redacted `details.completed`.
- Other failures map through the same [exit-codes.md](exit-codes.md) table as the CLI.

Token-like strings (`ghp_…`, `github_pat_…`, `Authorization: Bearer …`) are redacted in the error text and structured details.

## Embed the server

Hosts that want an in-process server can import the factory instead of spawning `pr-shepherd-mcp`:

```ts
import { createPrShepherdMcpServer, runPrShepherdMcpStdio } from "pr-shepherd/mcp";

const server = createPrShepherdMcpServer({ cwd: "/path/to/repo" });
// or
await runPrShepherdMcpStdio({ cwd: "/path/to/repo" });
```

`createPrShepherdMcpServer` also accepts `transport` and an optional `shepherd` for tests or alternate transports. It exposes the same seven tools: `iterate`, `apply`, `playbook`, `build_suggestion_patches`, `extract_journal`, `get_journal`, and the deprecated singular adapter.

## Related docs

- [cli-usage.md](cli-usage.md) — shell commands that pair with these tools
- [skills.md](skills.md) — Claude Code, Codex, and Grok skill dispatch and recurrence
- [actions.md](actions.md) — iterate action contract
- [api.md](api.md) — embed `createPrShepherd` / `createPrShepherdMcpServer`
- [architecture.md](architecture.md) — `src/mcp/` module map
