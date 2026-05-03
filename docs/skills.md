# pr-shepherd skills

[← README](../README.md)

Three Claude Code skills are included in the Claude plugin. A separate Codex plugin ships one umbrella `pr-shepherd` skill for check, resolve, monitor, and iterate workflows. The CLI can also emit Codex-compatible monitor instructions when called from Codex (`AGENT=codex` or `CODEX_CI=1`).

## Codex setup

Codex does not install or run the Claude plugin skills.

Install the Codex plugin marketplace from GitHub:

```sh
codex plugin marketplace add jonathanong/pr-shepherd
```

Or pin a branch/tag/ref:

```sh
codex plugin marketplace add jonathanong/pr-shepherd --ref main
```

For local development, point Codex at a checkout:

```sh
git clone https://github.com/jonathanong/pr-shepherd ~/.codex/plugin-sources/pr-shepherd
codex plugin marketplace add ~/.codex/plugin-sources/pr-shepherd
```

After adding the marketplace, open the Codex plugin directory, choose the `jonathanong` marketplace, and install/enable `pr-shepherd`. The marketplace root must contain `.agents/plugins/marketplace.json` and `plugins/pr-shepherd/`.

Then install the CLI in the repository where Codex will work:

```sh
npm install --save-dev pr-shepherd
```

If Codex is not already setting `CODEX_CI=1`, set `AGENT=codex` before invoking the CLI:

```sh
export AGENT=codex
```

Run `npx pr-shepherd monitor <PR>` once to bootstrap the workflow. Follow the output's `## Instructions`, then keep an active Codex goal cycling the emitted `npx pr-shepherd <PR>` command. Before each rerun, pick a fresh sleep/timeout between 1 and 4 minutes until Shepherd emits `[CANCEL]` for ready-delay completion or merged/closed, or `[ESCALATE]` (including `stall-timeout` for repeated unchanged CI failures). Codex does not provide the Claude `/loop` scheduler in this workflow.

The Codex plugin skill handles PR-number discovery, one-off check/resolve commands, and open-ended goal setup. It still delegates policy and state transitions to the CLI output's own `## Instructions` section.

## `/pr-shepherd:monitor`

Start continuous CI monitoring for a PR in Claude Code. Runs `npx pr-shepherd monitor <PR>` to get a pre-built dynamic `/loop` bootstrap block. Claude starts `/loop` with no fixed interval; each nonterminal tick schedules the next wakeup with `ScheduleWakeup` using `delaySeconds` between 60 and 240. The loop stops after the PR is merged/closed, Shepherd escalates, or the configured ready-delay elapses.

In Codex, run the CLI directly instead of the Claude slash command. `npx pr-shepherd monitor <PR>` emits explicit iterate instructions instead of `/loop` setup. After the bootstrap step, rerun the emitted `npx pr-shepherd <PR>` command after a fresh 1-4 minute sleep/timeout while the goal remains active.

Claude Code:

```
/pr-shepherd:monitor        # infer PR from current branch
/pr-shepherd:monitor 42
```

Codex:

```sh
npx pr-shepherd monitor        # bootstrap from current branch, then follow its instructions
npx pr-shepherd monitor 42     # bootstrap PR #42, then follow its instructions
npx pr-shepherd 42             # subsequent explicit tick
```

The ready-delay comes from `watch.readyDelayMinutes` in `.pr-shepherdrc.yml` (default: 10 minutes). The polling interval is dynamic: Claude and Codex choose a fresh 1-4 minute delay for each nonterminal recurrence.

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
