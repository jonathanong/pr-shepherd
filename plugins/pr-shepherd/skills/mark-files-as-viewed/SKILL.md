---
name: mark-files-as-viewed
description: 'Mark PR changed files as viewed in GitHub with pr-shepherd. Use for requests like "mark tests as viewed" or "mark these files as viewed".'
user-invocable: true
argument-hint: "[PR number or URL] [files|tests|--tests|--match REGEX]"
allowed-tools: ["Bash", "Read", "Grep", "Glob"]
---

# mark-files-as-viewed

Thin dispatcher for marking GitHub PR changed files as viewed.

## Arguments: $ARGUMENTS

## Steps

1. **Resolve arguments:**
   - If `$ARGUMENTS` contains a PR number, use it.
   - If `$ARGUMENTS` contains a GitHub PR URL, extract the number.
   - Otherwise, infer: `gh pr view --json number --jq .number`
   - Treat a standalone `tests` argument as `--tests`.
   - Preserve explicit file paths, `--tests`, and `--match <regex>` arguments.
   - If no PR found, report an error and stop.

2. **Run `pr-shepherd`:**

   ```bash
   pr-shepherd mark-files-as-viewed <N> <selectors>
   ```

   Print the full output.
