---
name: check
description: "Check GitHub CI status and review comments for the current PR"
argument-hint: "[PR number or URL ...]"
user-invocable: true
allowed-tools: ["Bash"]
---

# pr-shepherd check — PR Status

## Arguments: $ARGUMENTS

## Steps

1. **Parse `$ARGUMENTS`:** extract PR numbers or GitHub PR URLs. If none, infer:
   `gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --json number --jq '.[0].number'`
   If no PR found, report an error and stop.

2. **Short-circuit if merged:**

   ```bash
   gh pr view <N> --json state --jq '.state'
   ```

   If `MERGED`, output: `PR #N is already merged. Nothing to check.` and skip.

3. **Run the check and follow instructions:**
   Use the repository package runner selected by `packageManager` or lockfile
   (`pnpm exec`, `yarn run`, or `npx`).

   ```bash
   pr-shepherd check <N>
   ```

   Print the full output. Follow the `## Instructions` section exactly.

4. For multiple PRs, repeat steps 2–3 for each.
