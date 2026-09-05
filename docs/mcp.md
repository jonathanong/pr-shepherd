# pr-shepherd MCP server

[← README](../README.md)

pr-shepherd's agent integration is a local stdio MCP server. It shares command implementations, GitHub token resolution, and cascading `.pr-shepherdrc.yml` files with the CLI. Tools gather PR context (`iterate`), apply deterministic GitHub mutations (`apply`), and build checked suggestion patches (`build_suggestion_patches`). The calling client owns recurrence and any git mutations.

The published binary is `pr-shepherd-mcp` from the `pr-shepherd` npm package:

```text
npx --yes --package pr-shepherd@<version> pr-shepherd-mcp
```

Replace `<version>` with a published version (the shipped plugin files pin the same version as `package.json`). The server speaks stdio only. There is no hosted HTTP endpoint.

## Install

Two paths:

1. **Plugin** — skills plus a version-matched server. Prefer this in Claude Code, Codex, and Grok.
2. **MCP server only** — register `pr-shepherd-mcp` in the host when you do not want the plugin.

Install the `pr-shepherd` CLI separately only when you want the shell interface. The MCP server does not require a global CLI install.

Confirm GitHub auth before the first tool call. See [authentication.md](authentication.md).

### Plugin

The plugin launches `npx --yes --package pr-shepherd@<version> pr-shepherd-mcp` from `plugins/pr-shepherd/.mcp.json` (Claude Code and Grok) or `plugins/pr-shepherd/.codex.mcp.json` (Codex). The shipped `pr-shepherd` skill runs the poll command `pr-shepherd` and uses MCP `iterate` only when the CLI is unavailable. After a CLI poll, run the printed apply command. Use MCP `apply` / `build_suggestion_patches` only when this tick used MCP `iterate`.

#### Claude Code

```bash
claude /plugin marketplace add jonathanong/pr-shepherd
claude /plugin install pr-shepherd
```

Confirm the server in `/mcp`. Invoke the skill with `/goal /pr-shepherd:pr-shepherd` or `/goal /pr-shepherd:pr-shepherd 42`.

#### Codex

```bash
codex plugin marketplace add jonathanong/pr-shepherd
```

Or pin a ref:

```bash
codex plugin marketplace add jonathanong/pr-shepherd --ref main
```

For a local checkout:

```bash
git clone https://github.com/jonathanong/pr-shepherd ~/.codex/plugin-sources/pr-shepherd
codex plugin marketplace add ~/.codex/plugin-sources/pr-shepherd
```

After adding the marketplace, install/enable the `pr-shepherd` plugin from Codex. The marketplace root must contain `.agents/plugins/marketplace.json` and `plugins/pr-shepherd/`. Confirm the server with `/mcp`. Invoke the skill with `/goal $pr-shepherd` or `/goal $pr-shepherd 42`.

#### Grok

```bash
grok plugin marketplace add jonathanong/pr-shepherd
grok plugin install pr-shepherd --trust
```

Grok starts a plugin's MCP server only after the plugin is trusted. `--trust` grants that. Plugins under `~/.grok/plugins/` are trusted automatically; project plugins require trust.

Confirm with `grok mcp list`, `grok mcp doctor pr-shepherd`, or `/mcps`. Invoke the skill as `/pr-shepherd` or `/pr-shepherd:pr-shepherd` (add a PR number or URL when you do not want the current-branch PR).

### MCP server only

Register the same stdio command in any MCP client. Pin `@<version>` so the host does not float to an unexpected release.

#### Claude Code

```bash
claude mcp add --transport stdio --scope user pr-shepherd -- \
  npx --yes --package pr-shepherd@<version> pr-shepherd-mcp
```

`--scope user` writes to `~/.claude.json` and loads in every project. Use `--scope project` to write `.mcp.json` in the current repository, or omit `--scope` for a local (this-project, private) entry.

Project `.mcp.json`:

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

Confirm with `claude mcp list` or `/mcp`.

#### Codex

```bash
codex mcp add pr-shepherd -- \
  npx --yes --package pr-shepherd@<version> pr-shepherd-mcp
```

Or add a table in `~/.codex/config.toml` (user) or `.codex/config.toml` (trusted project):

```toml
[mcp_servers.pr-shepherd]
command = "npx"
args = ["--yes", "--package", "pr-shepherd@<version>", "pr-shepherd-mcp"]
```

Confirm with `codex mcp list` or `/mcp`.

#### Grok

```bash
grok mcp add pr-shepherd -- \
  npx --yes --package pr-shepherd@<version> pr-shepherd-mcp
```

`--scope user` (default) writes `~/.grok/config.toml`. `--scope project` writes `.grok/config.toml` in the current directory.

```toml
[mcp_servers.pr-shepherd]
command = "npx"
args = ["--yes", "--package", "pr-shepherd@<version>", "pr-shepherd-mcp"]
```

Confirm with `grok mcp list`, `grok mcp doctor pr-shepherd`, or `/mcps`.

### Local checkout

From this repository, after `npm install` (which builds `bin/`), launch once with:

```bash
npx pr-shepherd-mcp
```

That one-off command only resolves the checkout bin while the current directory is this repository. Persist the built file in client config with an absolute path; do not store `npx pr-shepherd-mcp`, which later launches from the PR repo and will not see this package's self-bin:

```bash
claude mcp add --transport stdio --scope user pr-shepherd -- \
  node /path/to/pr-shepherd/bin/mcp-stdio.mjs
codex mcp add pr-shepherd -- node /path/to/pr-shepherd/bin/mcp-stdio.mjs
grok mcp add pr-shepherd -- node /path/to/pr-shepherd/bin/mcp-stdio.mjs
```

Replace `/path/to/pr-shepherd` with this checkout's absolute path. Do not use a globally installed `pr-shepherd-mcp` while developing this repo. A stale global binary will not include unreleased tools.

## Tools

The server registers three canonical tools plus a deprecated singular suggestion adapter. Each result includes Markdown `content` (the same text the CLI would print) and `structuredContent`. For `iterate`, `structuredContent` is the same lean JSON projection the CLI emits for `--format=json` — the same computed top-level `instructions` array and `readyDelayOverride`, and the same trivial-default fields omitted (see the `iterate` section below). For `apply`, `build_suggestion_patches`, and `build_suggestion_patch`, `structuredContent` is the raw result object, matching what their CLI counterparts print as JSON.

Every MCP call requires a repository-qualified `pr`: either a GitHub PR URL such as `https://github.com/owner/repo/pull/123` or `owner/repo#123`. Bare PR numbers and omitted PRs are rejected. The named repository is the GitHub target and may differ from the server's startup working directory (or the `cwd` supplied to an embedded factory), which remains the local git/configuration/rules context.

| Tool                       | Purpose                                                                                                       | Side effects                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `iterate`                  | One state-machine tick. Surfaces review items, checks, merge state, and structured review-mutation arguments. | May mark a draft ready only when GitHub reports `viewerCanUpdate: true`; never cancels runs. |
| `apply`                    | Ordered review mutations, `mark_files_viewed`, and `append_journal` under one required `pr`.                  | Explicit operations are attempted; GitHub returns per-operation results and errors.          |
| `build_suggestion_patches` | Validate ordered anchored suggestions and return checked diffs plus commit metadata.                          | None. Never edits the worktree or git history.                                               |
| `build_suggestion_patch`   | Deprecated one-item adapter for `build_suggestion_patches`.                                                   | None. Never edits the worktree or git history.                                               |

Call `iterate` first. Translate its `resolveCommand` / `resolveOnlyCommand` arguments into an `apply` `review_mutations` operation. Use one `build_suggestion_patches` call for all marked suggestion threads in displayed order. `mark_files_viewed` performs the requested viewed-state mutations and reports GitHub's results. Use `append_journal` only when the caller asks for that mutation; direct apply honors that explicit intent even when `viewerCanUpdate` is false.

`build_suggestion_patches` treats GitHub's anchored line range at the fetched PR head as authoritative. It accepts a clean local descendant only when the full ordered patch stream passes `git apply --check`; otherwise inspect the current source and reviewer intent manually.

Hosts namespace tool names with the server name (`pr-shepherd__iterate` in Grok, `mcp__pr-shepherd__iterate` in some Claude setups). The unqualified names below are the server-registered names.

### `iterate`

| Input                    | Type                            | Required | Meaning                                                   |
| ------------------------ | ------------------------------- | -------- | --------------------------------------------------------- |
| `pr`                     | GitHub PR URL or `owner/repo#N` | yes      | PR to inspect; its named repository is the GitHub target. |
| `readyDelaySeconds`      | non-negative number             | no       | Override the ready-delay window.                          |
| `stallTimeoutSeconds`    | non-negative number             | no       | Override the stall timeout.                               |
| `noAutoMarkReady`        | boolean                         | no       | Disable automatic draft → ready.                          |
| `noAutoCancelActionable` | boolean                         | no       | Deprecated no-op; Shepherd never cancels workflow runs.   |
| `merge`                  | boolean                         | no       | Shepherd to readiness and emit merge/queue commands.      |
| `neverCancelRuns`        | string array                    | no       | Deprecated per-call no-op retained for compatibility.     |

The result's Markdown `content` is the CLI's default (lean) rendering, and `structuredContent` is the matching lean JSON projection of the `IterateResult` — not the raw result object. This means `structuredContent` omits fields that are the trivial default (`shouldCancel`, `apiUsage`, `mergeStatus` when it's the healthy `CLEAN` value, `reviewDecision` unless the PR is blocked, `remainingSeconds` unless the ready-delay countdown is active, `checks` outside `fix_code`, and more — see [actions.md](actions.md)) and adds `readyDelayOverride` when `readyDelaySeconds` was supplied. For every action except `fix_code`, it also adds a computed top-level `instructions` array; for `fix_code`, the equivalent steps are under `fix.instructions` instead. Action semantics, instruction text, and the full field contract live in [actions.md](actions.md).

### `apply`

| Input        | Type                            | Required | Meaning                                                                  |
| ------------ | ------------------------------- | -------- | ------------------------------------------------------------------------ |
| `pr`         | GitHub PR URL or `owner/repo#N` | yes      | PR shared by every operation; its named repository is the GitHub target. |
| `operations` | non-empty array                 | yes      | Mutations, in this exact order, after every operation is validated.      |

Each operation is one of:

`review_mutations`

| Field                | Type                 | Required                                |
| -------------------- | -------------------- | --------------------------------------- |
| `type`               | `"review_mutations"` | yes                                     |
| `resolveThreadIds`   | string array         | no                                      |
| `replyThreadIds`     | string array         | no                                      |
| `minimizeCommentIds` | string array         | no                                      |
| `dismissReviewIds`   | string array         | no                                      |
| `message`            | string               | yes when replying or dismissing         |
| `requireSha`         | string               | no; poll until this HEAD SHA is visible |

`mark_files_viewed`

| Field           | Type                  | Required | Meaning                   |
| --------------- | --------------------- | -------- | ------------------------- |
| `type`          | `"mark_files_viewed"` | yes      |                           |
| `files`         | string array          | no       | Exact changed-file paths  |
| `tests`         | boolean               | no       | Select changed test files |
| `matchPatterns` | string array          | no       | Glob/regex selectors      |

`append_journal`

| Field    | Type               | Required | Meaning                             |
| -------- | ------------------ | -------- | ----------------------------------- |
| `type`   | `"append_journal"` | yes      |                                     |
| `item`   | string             | yes      | Idempotent Shepherd Journal entry   |
| `dryRun` | boolean            | no       | Preview without writing the PR body |

### `build_suggestion_patches`

| Input         | Type                            | Required | Meaning                                                            |
| ------------- | ------------------------------- | -------- | ------------------------------------------------------------------ |
| `pr`          | GitHub PR URL or `owner/repo#N` | yes      | PR for the suggestions; its named repository is the GitHub target. |
| `suggestions` | non-empty object array          | yes      | Ordered `{ threadId, message, description? }` suggestion requests. |

The result includes ordered `patches[]` entries with thread, path, range, author, patch, files-to-stage, and commit metadata, plus shared `postActionInstructions`. Apply and commit each patch in order. Shepherd does not recommend a push or review mutation from this standalone result because it cannot verify those authorizations; use the originating iterate output for authorization-checked actions. `build_suggestion_patch` remains temporarily as a deprecated adapter.

## Recurrence

MCP clients own polling. Do not expect a long-running poll tool. MCP `iterate` has no `--debounce`; late comments and CI failures are not batched the way the shell poll dispatcher batches them.

This isn't a stated preference — it's a client-side constraint a locally-run MCP server cannot get around. The MCP TypeScript SDK's client enforces a default per-request timeout of 60 seconds (`DEFAULT_REQUEST_TIMEOUT_MSEC`). The protocol lets a server send `notifications/progress` to keep a long call alive, but resetting the timeout on progress (`resetTimeoutOnProgress`) is a client call-site option — the host decides whether to ask for it when it calls the tool, not the server. Claude Code has an open, unresolved issue (`anthropics/claude-code#58687`) where the client times out long tool calls even when the server sends correct progress notifications, so the spec-compliant keepalive path isn't reliable there today; no stable, documented environment variable gives a guaranteed longer client-side timeout (`MCP_TIMEOUT` covers server _startup_ only, and `MCP_TOOL_TIMEOUT` support has been inconsistent across Claude Code versions). Codex CLI shares the same 60-second default but exposes a `tool_timeout_sec` config knob a user can raise. Grok CLI's own host-side MCP timeout is unconfirmed as of this writing.

A poll tool that blocks or sleeps across ticks would risk hitting this ceiling on at least two of the three plugin hosts, with no reliable way for this server to prevent it — hence no poll tool. This is what distinguishes the existing tools: none of them intentionally poll or sleep. `iterate` and `build_suggestion_patches` are each one GraphQL batch. `apply` doesn't sleep either, but it awaits its `operations` sequentially and each one performs GitHub I/O — a large multi-operation request against a slow GitHub response could still approach the timeout, and a failure partway through leaves earlier mutations already applied without the client seeing a response (`PartialApplyError`'s `completed` list is the recovery path). None of this makes any of the three tools immune to the timeout; it means they don't compound it the way a sleeping poll loop would.

1. Call `iterate` with a repository-qualified `pr`.
2. Follow the returned `## Instructions`.
3. For `WAIT` or `MARK_READY`, call `iterate` again when the host is ready to recheck. Do not wait for CI with `gh pr checks`, `gh pr watch`, `gh run watch`, or equivalent GitHub MCP check waiters; fetching check logs is fine.
4. For `FIX_CODE`, finish the code/review work, then call `iterate` immediately. Do not wait for CI to finish first.
5. For `MERGE`, run the returned command (and only the conditionally documented fallback), then call `iterate` immediately.
6. Stop on `CANCEL` or `ESCALATE`.

The shell command `pr-shepherd [PR]` is the bounded poll dispatcher. It is not an MCP tool. See [skills.md](skills.md).

## Authentication, cwd, and environment

The server uses its startup working directory (or an embedded factory's `cwd`) for local git, cascading `.pr-shepherdrc.yml` files, classification rules, and per-worktree debug logging. An explicit `pr` changes only the GitHub target; it does not change that local context. PR-scoped state uses the explicit target repository and PR number.

Token resolution is the same as the CLI: `GH_TOKEN`, `GITHUB_TOKEN`, `gh auth token`, then `GITHUB_PERSONAL_ACCESS_TOKEN`. See [authentication.md](authentication.md).

Other environment variables:

- `PR_SHEPHERD_STATE_DIR` — seen markers, stall files, ready-delay, and the debug log.
- `PR_SHEPHERD_LOG_DISABLED=1` — disable the per-worktree debug log.

Print the log path with `pr-shepherd admin log-file` from a shell. That command is not an MCP tool.

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

`createPrShepherdMcpServer` accepts an optional `shepherd` for tests or alternate transports. The public factory exposes canonical `iterate`, `apply`, and `build_suggestion_patches` plus the deprecated singular adapter.

## Related docs

- [cli-usage.md](cli-usage.md) — shell commands that pair with these tools
- [skills.md](skills.md) — Claude Code, Codex, and Grok skill dispatch and recurrence
- [actions.md](actions.md) — iterate action contract
- [api.md](api.md) — embed `createPrShepherd` / `createPrShepherdMcpServer`
- [architecture.md](architecture.md) — `src/mcp/` module map
