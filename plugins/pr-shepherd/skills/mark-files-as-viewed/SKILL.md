---
name: mark-files-as-viewed
description: "Mark selected changed pull-request files as viewed with pr-shepherd."
user-invocable: true
argument-hint: "[PR number or URL] [files|tests|--tests|--match REGEX]"
allowed-tools: Bash(npx pr-shepherd:*), Bash(pnpm exec pr-shepherd:*), Bash(pnpm dlx pr-shepherd:*), Bash(bunx pr-shepherd:*), Bash(pr-shepherd:*)
---

# mark-files-as-viewed

Thin dispatcher for explicit file-view mutations. The operation attempts `markFileAsViewed` for selected files and surfaces GitHub's per-file results.

## Arguments: $ARGUMENTS

1. Parse an optional PR number, repository-qualified `owner/repo#N`, or GitHub PR URL. Treat standalone `tests` as `--tests`; preserve explicit paths and `--match <regex>` selectors.

2. Convert a supplied `owner/repo#N` to `https://github.com/owner/repo/pull/N`; pass a bare number or omitted target unchanged so the CLI resolves it in the local checkout (no separate `gh pr view`). Run `pr-shepherd apply files` with the PR and the selectors, then print the full result. A qualified reference may target a fork or upstream repository; the current checkout remains the local context.
