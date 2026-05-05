---
name: resolve
description: "Resolve all inline review comments on the current PR"
argument-hint: "[PR number or URL]"
user-invocable: true
allowed-tools: ["Bash", "Read", "Grep", "Edit", "Write", "Glob", "Skill"]
---

# pr-shepherd resolve — Fix and Resolve Review Comments

Resolve unresolved review threads and minimize PR comments on the current PR — from ALL authors.

## Arguments: $ARGUMENTS

## Steps

1. **Resolve PR number:**
   - If `$ARGUMENTS` contains a PR number or GitHub PR URL, extract the number.
   - Otherwise, infer: `gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --json number --jq '.[0].number'`
   - If no PR found, report an error and stop.

2. **Short-circuit if merged:**

   ```bash
   gh pr view <N> --json state --jq '.state'
   ```

   If `MERGED`, invoke `/loop cancel` via the Skill tool, output a merged message, and stop.

3. **Fetch and follow instructions:**
   Use the repository package runner selected by `packageManager` or lockfile
   (`pnpm exec`, `yarn run`, or `npx`).

   ```bash
   pr-shepherd resolve <N> --fetch
   ```

   Print the full output. Follow the `## Instructions` section exactly.
