---
name: mark-files-as-viewed
description: "Mark changed pull-request files as viewed with pr-shepherd (MCP or CLI)."
user-invocable: true
argument-hint: "[PR number or URL] [files|tests|--tests|--match REGEX]"
allowed-tools: ["MCP", "Bash", "Read", "Grep", "Glob"]
---

# mark-files-as-viewed

Thin dispatcher for marking PR files viewed. Use the MCP server when it is available; otherwise use the CLI.

## Arguments: $ARGUMENTS

1. Parse an optional PR number or GitHub PR URL. Treat standalone `tests` as `--tests`; preserve explicit paths and `--match <regex>` selectors.

2. If the `apply` MCP tool is available, call it with one `mark_files_viewed` operation, then print the full result. Otherwise run `pr-shepherd apply files` with the parsed PR and selectors and print the full result.
