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

2. If the `apply` MCP tool is available, first obtain a repository-qualified reference: use a supplied GitHub PR URL or `owner/repo#N` unchanged; for a bare number, run `gh pr view <number> --json url --jq .url`; when omitted, run `gh pr view --json url --jq .url`. If that does not produce one qualified PR reference, stop and report that MCP cannot safely determine the PR. Otherwise call `apply` with that qualified reference and one `mark_files_viewed` operation, then print the full result. If MCP is unavailable, convert a supplied `owner/repo#N` to `https://github.com/owner/repo/pull/N` and otherwise pass the parsed PR unchanged to `pr-shepherd apply files` with the selectors, then print the full result. A qualified reference may target a fork or upstream repository; the current checkout remains the local git/config/rules context.
