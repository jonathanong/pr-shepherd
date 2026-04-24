---
name: monitor
description: "Start continuous CI monitoring — marks PR ready for review when all checks pass"
argument-hint: "[PR number or URL]"
user-invocable: true
allowed-tools:
  ["Bash", "Read", "Grep", "Edit", "Write", "Glob", "Skill", "CronCreate", "CronList", "CronDelete"]
---

# pr-shepherd monitor — Continuous PR Monitor

## Arguments: $ARGUMENTS

## Steps

1. **Resolve PR number:**
   - If `$ARGUMENTS` contains a PR number or GitHub PR URL, extract the number.
   - Otherwise, infer: `gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --json number --jq '.[0].number'`
   - If no PR found, report an error and stop.

2. **Run the bootstrap command and follow its instructions:**

   ```bash
   npx pr-shepherd monitor <N>
   ```

   Print the full output. Follow the `## Instructions` section exactly.
