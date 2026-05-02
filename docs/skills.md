# pr-shepherd skills

[← README](../README.md)

Three Claude Code skills are included in the plugin. The CLI can also emit Codex-compatible monitor instructions when called from Codex (`AGENT=codex` or `CODEX_CI=1`).

## Codex setup

Codex does not install or run the Claude plugin skills. Install the CLI in the repository where Codex will work:

```sh
npm install --save-dev pr-shepherd
```

If Codex is not already setting `CODEX_CI=1`, set `AGENT=codex` before invoking the CLI:

```sh
export AGENT=codex
```

Run `npx pr-shepherd monitor <PR>` once to bootstrap the workflow. Follow the output's `## Instructions`, then rerun the emitted `npx pr-shepherd iterate <PR>` command whenever you want another one-shot check. Codex does not provide the Claude `/loop` scheduler in this workflow.

## `/pr-shepherd:monitor`

Start continuous CI monitoring for a PR in Claude Code. Runs `npx pr-shepherd monitor <PR>` to get a pre-built `/loop` bootstrap block (interval and the recurring iterate prompt), then creates the cron job. The loop fires at the configured interval, calls `pr-shepherd iterate`, and follows the `## Instructions` in the output. The loop cancels automatically after the PR is merged/closed or after the configured ready-delay.

In Codex, run the CLI directly instead of the Claude slash command. `npx pr-shepherd monitor <PR>` emits one-shot iterate instructions instead of `/loop` setup. After the bootstrap step, rerun the emitted `npx pr-shepherd iterate <PR>` command later to check again.

Claude Code:

```
/pr-shepherd:monitor        # infer PR from current branch
/pr-shepherd:monitor 42
```

Codex:

```sh
npx pr-shepherd monitor        # bootstrap from current branch, then follow its instructions
npx pr-shepherd monitor 42     # bootstrap PR #42, then follow its instructions
npx pr-shepherd iterate 42     # subsequent one-shot tick
```

The polling interval and ready-delay come from `watch.interval` and `watch.readyDelayMinutes` in `.pr-shepherdrc.yml` (defaults: 4 minutes and 10 minutes). The 4-minute default is intentional — it keeps Claude's prompt cache warm (5-minute TTL).

**Loop deduplication:** The CLI output's `## Instructions` handles dedup — the skill checks `CronList` for a job tagged `#pr-shepherd-loop:pr=<N>:` and runs one iteration inline if one already exists, instead of creating a duplicate.

## `/pr-shepherd:check`

One-shot PR status snapshot. Reports merge status, CI results, and unresolved comments. The skill is a thin dispatcher: it runs `pr-shepherd check <N>`, prints the Markdown output, then follows the `## Instructions` section embedded in that output. All rebase policy, CI budget rules, and ready-to-merge gating are described in the CLI output itself — not in the skill.

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
