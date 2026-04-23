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

**Commit-suggestion preference.** For every actionable thread whose body contains a ` ```suggestion ` fenced block, `resolve --fetch` attaches a parsed `suggestion` field and exposes a top-level `commitSuggestionsEnabled` flag (see [`actions.commitSuggestions`](configuration.md#actionscommitsuggestions--default-true)). When the flag is `true` (the default), the skill prefers invoking [`pr-shepherd commit-suggestion`](usage.md#pr-shepherd-commit-suggestion-pr---thread-id-a---message) (singular) once per thread, writing a concise commit message for each — this applies the reviewer's change verbatim, creates a local commit co-crediting the reviewer with a `Co-authored-by` trailer, and resolves the thread on GitHub. Threads where the patch fails to apply fall through to the manual-edit path. After all per-thread calls succeed, the normal rebase-and-push step handles the push.
