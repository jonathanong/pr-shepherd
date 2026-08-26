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

1. Parse an optional PR number, repository-qualified `owner/repo#N`, or GitHub PR URL. Treat standalone `tests` as `--tests`; preserve explicit paths and `--match <regex>` selectors.

2. If the `apply` MCP tool is available, first obtain a repository-qualified reference: use a supplied GitHub PR URL or `owner/repo#N` unchanged; for a bare number, run `gh pr view <number> --json url --jq .url`; when omitted, run `gh pr view --json url --jq .url`. If that does not produce one qualified PR reference, stop and report that MCP cannot safely determine the PR. Otherwise call `apply` with that qualified reference and one `mark_files_viewed` operation, then print the full result. If MCP is unavailable and the parsed PR is repository-qualified, run `gh repo view --json nameWithOwner --jq .nameWithOwner` and verify that repository matches the reference case-insensitively. Stop on a mismatch or failed lookup; the CLI does not validate the URL repository. Convert a verified `owner/repo#N` to `https://github.com/owner/repo/pull/N`, then run `pr-shepherd apply files` with the parsed PR and selectors and print the full result.
