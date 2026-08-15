---
name: pr-shepherd
description: 'Iterate a GitHub pull request with the pr-shepherd MCP server. Use for requests like "use pr-shepherd", "iterate PR #123", or "run pr-shepherd until this PR is ready".'
user-invocable: true
argument-hint: "[PR number or URL]"
allowed-tools: ["MCP", "Read", "Grep", "Glob", "Edit", "Write"]
---

# pr-shepherd

Thin MCP dispatcher for iterating a PR.

## Arguments: $ARGUMENTS

1. Parse an optional PR number or GitHub PR URL from `$ARGUMENTS`; otherwise let `iterate` infer the current branch PR.

2. Call the `iterate` MCP tool and print its full result.

3. Follow the returned instructions exactly. Use `build_suggestion_patch` for a suggestion thread and `apply` for returned review mutations. After completing an action, call `iterate` again until it returns a terminal action or the human directs you to stop.
