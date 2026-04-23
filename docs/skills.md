# pr-shepherd skills

[← README](../README.md)

Three Claude Code skills are included in the plugin.

## `/pr-shepherd:monitor`

Start continuous CI monitoring for a PR. Creates a `/loop` cron job that fires every 4 minutes, calls `pr-shepherd iterate`, and dispatches on the JSON action result. The loop cancels automatically after the PR is merged/closed or after a 10-minute settle window when the PR is clean.

```
/pr-shepherd:monitor                     # infer PR from current branch
/pr-shepherd:monitor 42
/pr-shepherd:monitor 42 every 8m
/pr-shepherd:monitor 42 --ready-delay 15m
```

The 4-minute default is intentional — it keeps Claude's prompt cache warm (5-minute TTL).

**Loop deduplication:** Before creating a loop, the skill checks `CronList` for a job tagged `# pr-shepherd-loop:pr=<N>`. If one exists, it runs one iteration inline instead of creating a duplicate.

## `/pr-shepherd:check`

One-shot PR status snapshot. Reports merge status, CI results, and unresolved comments.

```
/pr-shepherd:check        # infer from branch
/pr-shepherd:check 42
/pr-shepherd:check 41 42 43
```

## `/pr-shepherd:resolve`

Fetch all actionable review threads and comments, triage them, fix the code, push, and resolve/minimize/dismiss via the CLI. Uses `--require-sha` to ensure GitHub has seen the push before resolving.

```
/pr-shepherd:resolve       # infer from branch
/pr-shepherd:resolve 42
```

The skill is a thin dispatcher: it runs `pr-shepherd resolve <N> --fetch`, prints the Markdown output, then follows the `## Instructions` section embedded in that output. All triage logic, commit-suggestion preference, fix-and-push steps, and reporting invariants are described in the CLI output itself — not in the skill.
