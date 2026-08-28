# pr-shepherd skills

[← README](../README.md) | [actions.md](actions.md) | [iterate-flow.md](iterate-flow.md)

Two skills are shipped for Claude Code, Codex, and Grok. They are thin dispatchers: parse arguments, call the CLI or MCP, print the full result, and follow `## Instructions`. Policy lives in that output, not in the skill prompt.

- `pr-shepherd` runs the poll command `pr-shepherd` (not `pr-shepherd iterate`). If the CLI is unavailable, it calls MCP `iterate` and must use MCP `apply` / `build_suggestion_patches` for the returned operations (there is no `pr-shepherd apply` shell command in that setup). After a CLI poll it runs the printed apply command.
- `mark-files-as-viewed` calls MCP `apply` with a `mark_files_viewed` operation, or runs `pr-shepherd apply files`.

Install the plugin (skills plus the version-matched MCP server) or register `pr-shepherd-mcp` yourself. See [mcp.md](mcp.md). The CLI path needs `pr-shepherd` on `PATH`.

## Recurrence

The skill's default fetch is the bounded poll command `pr-shepherd [PR]`, which sleeps through `WAIT`. After the first `FIX_CODE`, poll waits `--debounce` (default 1m) while still iterating at `--interval`, then returns the post-window tick. That settle window batches late review comments and CI failures into one agent-facing result. MCP `iterate` is the fallback when the CLI is unavailable; it has no debounce, and the host chooses when to recheck.

Each non-terminal action is followed by another poll (or another `iterate` call when only MCP is available). `[FIX_CODE]` work and an emitted `[MERGE]` command must be handled before the next tick. `[CANCEL]`, `[ESCALATE]`, and an explicit human handoff in the returned instructions pause automated recurrence. Pass `--merge` to the skill to forward the opt-in to CLI or MCP. The MCP server does not run an unbounded polling loop.

```
User                    Active Goal             pr-shepherd
 |                          |                        |
 |-- /goal /pr-shepherd --> |                        |
 |                          |-- pr-shepherd <PR> --> |
 |                          |                        |-- GraphQL fetch
 |                          |                        |-- classify
 |                          |                        |-- dispatch
 |                          |<-- action + data
 |                          |                        |
 |  [if wait/mark_ready]    |-- pr-shepherd <PR> --> |
 |  [if fix_code]           |-- fix, commit, push    |
 |                          |-- apply review         |
 |                          |-- pr-shepherd <PR> --> |
 |  [if cancel/escalate]    |   goal ends            |
```

Ready-delay (default 10 minutes) is `watch.readyDelayMinutes`. See [iterate-flow.md](iterate-flow.md#2-ready-delay) and [configuration.md](configuration.md).

## Claude Code

Install the plugin:

```bash
claude /plugin marketplace add jonathanong/pr-shepherd
claude /plugin install pr-shepherd
```

Use the skill inside a `/goal`:

```
/goal /pr-shepherd:pr-shepherd        # infer PR from current branch
/goal /pr-shepherd:pr-shepherd 42
/pr-shepherd:mark-files-as-viewed 42 tests
```

The goal loop handles recurrence. The skill prints the full result and follows its plan. `[CANCEL]` and `[ESCALATE]` stop the goal.

## Codex

Install the Codex plugin marketplace from GitHub:

```sh
codex plugin marketplace add jonathanong/pr-shepherd
```

Or pin a branch/tag/ref:

```sh
codex plugin marketplace add jonathanong/pr-shepherd --ref main
```

For local development, point Codex at a checkout:

```sh
git clone https://github.com/jonathanong/pr-shepherd ~/.codex/plugin-sources/pr-shepherd
codex plugin marketplace add ~/.codex/plugin-sources/pr-shepherd
```

After adding the marketplace, open the Codex plugin directory, choose the `jonathanong` marketplace, and install/enable `pr-shepherd`.

Use the skill inside a `/goal`:

```
/goal $pr-shepherd        # infer PR from current branch
/goal $pr-shepherd 42
$mark-files-as-viewed 42 tests
```

Codex runs the same skill and continues until `[CANCEL]` or `[ESCALATE]`.

## Grok

Install the plugin and trust it so the bundled MCP server starts:

```bash
grok plugin marketplace add jonathanong/pr-shepherd
grok plugin install pr-shepherd --trust
```

Or register the server without the plugin:

```bash
grok mcp add pr-shepherd -- npx --yes --package pr-shepherd@<version> pr-shepherd-mcp
```

Use the skill from the slash menu:

```text
/pr-shepherd
/pr-shepherd 42
/pr-shepherd:mark-files-as-viewed 42 tests
```

The session owns recurrence. The skill prints the full result and follows its plan. `[CANCEL]` and `[ESCALATE]` stop the work.

## Operations

CLI `pr-shepherd` (the poll command) or MCP `iterate` obtains the next state-machine action and returns structured review-mutation arguments. MCP `apply` (or the CLI `apply` commands named in the output) performs explicit ordered review mutations, `mark_files_viewed` file operations, or `append_journal` operations. `build_suggestion_patches` validates and builds ordered patches for anchored suggestions. The skills leave this policy in the printed output rather than duplicating it in prompts.
