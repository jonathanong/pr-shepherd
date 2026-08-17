# pr-shepherd skills

[← README](../README.md)

Two skills are shipped for Claude Code, Codex, and Grok. The iterate skill polls with the CLI and falls back to MCP `iterate` if the CLI is missing. `mark-files-as-viewed` uses MCP when the server is available and the CLI otherwise:

- `pr-shepherd` runs the poll command `pr-shepherd` (not `pr-shepherd iterate`). If the CLI is unavailable, it calls MCP `iterate`. It then follows the returned action data with `apply` / `build_suggestion_patch` (MCP) or the printed apply instructions (CLI).
- `mark-files-as-viewed` calls MCP `apply` with a `mark_files_viewed` operation, or runs `pr-shepherd apply files`.

Install the plugin (skills plus the version-matched MCP server) or register `pr-shepherd-mcp` yourself. See [mcp.md](mcp.md). The CLI path needs `pr-shepherd` on `PATH`.

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

```
/pr-shepherd
/pr-shepherd 42
/pr-shepherd:mark-files-as-viewed 42 tests
```

The session owns recurrence. The skill prints the full result and follows its plan. `[CANCEL]` and `[ESCALATE]` stop the work.

## Operations

CLI `pr-shepherd` (the poll command) or MCP `iterate` obtains the next state-machine action and returns structured review-mutation arguments. MCP `apply` (or the CLI `apply` commands named in the output) performs explicit ordered review mutations, `mark_files_viewed` file operations, or `append_journal` operations. `build_suggestion_patch` validates and builds a patch for one anchored suggestion. The skills leave this policy in the printed output rather than duplicating it in prompts.
