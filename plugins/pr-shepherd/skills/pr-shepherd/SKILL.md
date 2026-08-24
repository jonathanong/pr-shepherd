---
name: pr-shepherd
description: 'Iterate a GitHub pull request with pr-shepherd (MCP or CLI). Use for requests like "use pr-shepherd", "iterate PR #123", or "run pr-shepherd until this PR is ready".'
user-invocable: true
argument-hint: "[PR number or URL]"
allowed-tools: ["MCP", "Bash", "Read", "Grep", "Glob", "Edit", "Write"]
---

# pr-shepherd

Thin dispatcher for iterating a PR. Poll with the CLI; use MCP `iterate` only when the CLI is unavailable.

## Arguments: $ARGUMENTS

1. Parse an optional PR number or GitHub PR URL from `$ARGUMENTS`; otherwise let pr-shepherd infer the current branch PR.

2. Run the poll command `pr-shepherd` with the optional PR argument and print its full result. Do not run `pr-shepherd iterate`. If the CLI is unavailable and the `iterate` MCP tool is available, call `iterate` and print its full result.

3. Print the full result and follow every returned `## Instructions` step exactly. For CLI output, run each printed mutation command when instructed. For MCP output, use MCP `apply` and `build_suggestion_patch`; do not run a shell `pr-shepherd apply` command.

4. After completing the returned instructions, repeat step 2 unless the action is `[CANCEL]` or `[ESCALATE]`, or the human directs you to stop.
