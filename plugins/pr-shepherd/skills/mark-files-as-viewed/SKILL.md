---
name: mark-files-as-viewed
description: "Select changed pull-request files and report viewed-state authorization diagnostics with pr-shepherd (MCP or CLI)."
user-invocable: true
argument-hint: "[PR number or URL] [files|tests|--tests|--match REGEX]"
allowed-tools: ["MCP", "Bash", "Read", "Grep", "Glob"]
---

# mark-files-as-viewed

Thin dispatcher for selection-only file-view authorization diagnostics. GitHub exposes no exact viewer capability for marking a PR file viewed, so this operation never recommends or attempts that mutation. Use the MCP server when it is available; otherwise use the CLI.

## Arguments: $ARGUMENTS

1. Parse an optional PR number, repository-qualified `owner/repo#N`, or GitHub PR URL. Treat standalone `tests` as `--tests`; preserve explicit paths and `--match <regex>` selectors.

2. Determine the local `owner/repo` without GitHub I/O from the read-only `git remote get-url origin`; accept only an unambiguous GitHub remote and stop if it cannot be derived. Use it to qualify a bare PR number. When no PR was supplied, use the CLI fallback so it can perform its normal authenticated PR discovery. For a supplied GitHub PR URL or `owner/repo#N`, verify its repository matches the local remote case-insensitively and stop on mismatch. If the `apply` MCP tool is available and the PR is now repository-qualified, call it with one selection-only `mark_files_viewed` operation and print the full result. Otherwise convert a verified `owner/repo#N` to `https://github.com/owner/repo/pull/N`, run `pr-shepherd apply files` with the parsed PR and selectors, and print the full result.
