---
name: pr-shepherd
description: 'Iterate a GitHub pull request with pr-shepherd (MCP or CLI). Use for requests like "use pr-shepherd", "iterate PR #123", or "run pr-shepherd until this PR is ready".'
user-invocable: true
argument-hint: "[PR number or URL]"
allowed-tools: ["MCP", "Bash", "Read", "Grep", "Glob", "Edit", "Write"]
---

# pr-shepherd

Thin dispatcher for iterating a PR. Use the MCP server when it is available; otherwise use the CLI.

## Arguments: $ARGUMENTS

1. Parse an optional PR number or GitHub PR URL from `$ARGUMENTS`; otherwise let pr-shepherd infer the current branch PR.

2. If the `iterate` MCP tool is available, call it and print its full result. Otherwise run `pr-shepherd` with the optional PR argument and print its full result. Do not run `pr-shepherd iterate`.

3. Follow the returned instructions exactly. After completing an action, call `iterate` again (MCP) or run `pr-shepherd` again (CLI) until a terminal action or the human directs you to stop.
