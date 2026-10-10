---
name: mark-files-as-viewed
description: "Mark selected changed pull-request files as viewed with pr-shepherd (MCP or CLI)."
user-invocable: true
argument-hint: "[PR number or URL] [files|tests|--tests|--match REGEX]"
allowed-tools: ["MCP", "Bash", "Read", "Grep", "Glob"]
---

# mark-files-as-viewed

Thin dispatcher for explicit file-view mutations. The operation attempts `markFileAsViewed` for selected files and surfaces GitHub's per-file results. Use the MCP server when it is available; otherwise use the CLI.

## Arguments: $ARGUMENTS

1. Parse an optional PR number, repository-qualified `owner/repo#N`, or GitHub PR URL. Treat standalone `tests` as `--tests`; preserve explicit paths and `--match <regex>` selectors.

2. If the `apply` MCP tool is available and the target is already a GitHub PR URL or `owner/repo#N`, call `apply` with that qualified reference and one `mark_files_viewed` operation, then print the full result. For a bare number or omitted target, use `pr-shepherd apply files` directly so the CLI resolves it in the local checkout; do not make a separate `gh pr view` discovery request. If MCP is unavailable, convert a supplied `owner/repo#N` to `https://github.com/owner/repo/pull/N` and otherwise pass the parsed PR unchanged to `pr-shepherd apply files` with the selectors, then print the full result. A qualified reference may target a fork or upstream repository; the current checkout remains the local git/config/rules context.
