---
name: mark-files-as-viewed
description: "Mark changed pull-request files as viewed with the pr-shepherd MCP server."
user-invocable: true
argument-hint: "[PR number or URL] [files|tests|--tests|--match REGEX]"
allowed-tools: ["MCP", "Read", "Grep", "Glob"]
---

# mark-files-as-viewed

Thin MCP dispatcher for marking PR files viewed.

## Arguments: $ARGUMENTS

1. Parse an optional PR number or GitHub PR URL. Treat standalone `tests` as `--tests`; preserve explicit paths and `--match <regex>` selectors.

2. Call the `apply` MCP tool with one `mark_files_viewed` operation, then print the full result.
