# pr-shepherd skills

[← README](../README.md)

Two MCP-backed skills are shipped for both Claude Code and Codex:

- `pr-shepherd` calls `iterate`, then uses its returned action data with `apply` and `build_suggestion_patch` when needed.
- `mark-files-as-viewed` calls `apply` with a `mark_files_viewed` operation.

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

The goal loop handles recurrence. The skill prints the full MCP result and follows its plan. `[CANCEL]` and `[ESCALATE]` stop the goal.

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

Codex runs the same MCP-backed skill and continues until `[CANCEL]` or `[ESCALATE]`.

## MCP operations

`iterate` obtains the next state-machine action and returns its structured review mutation arguments. `apply` performs explicit ordered review mutations, `mark_files_viewed` file operations, or `append_journal` operations. `build_suggestion_patch` validates and builds a patch for one anchored suggestion. The skills leave this policy in MCP/iterate output rather than duplicating it in prompts.
