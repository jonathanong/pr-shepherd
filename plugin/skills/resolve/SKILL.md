---
name: resolve
description: "Resolve all inline review comments on the current PR"
argument-hint: "[PR number or URL] [--thread-id ID | --comment-id ID] [--require-sha SHA]"
user-invocable: true
allowed-tools: ["Bash", "Read", "Grep", "Edit", "Write", "Glob", "Skill"]
---

# pr-shepherd resolve — Fix and Resolve Review Comments

Resolve unresolved review threads and minimize PR comments on the current PR — from ALL authors.

## Arguments: $ARGUMENTS

## Steps

1. **Parse `$ARGUMENTS`:**
   - Extract and remove any `--thread-id ID`, `--comment-id ID`, or `--require-sha SHA` flags.
   - Look for a PR number or GitHub PR URL in the remaining text.
   - If not found, infer: `gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --json number --jq '.[0].number'`
   - If no PR found, report an error and stop.

2. **Short-circuit if merged:**

   ```bash
   gh pr view <N> --json state --jq '.state'
   ```

   If `MERGED`, invoke `/loop cancel` via the Skill tool, output a merged message, and stop.

3. **Fetch and follow instructions:**

   ```bash
   npx pr-shepherd resolve <N> --fetch
   ```

   Print the full output. Follow the `## Instructions` section exactly.
