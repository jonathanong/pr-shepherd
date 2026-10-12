# pr-shepherd evals

**Does an agent act correctly on pr-shepherd's output, and would it without the
plugin?**

46 cases replay real recorded pr-shepherd output, mostly from the states agents
get wrong in real transcripts. Five of those (`38`, `39`, `44`–`46`) also replay
earlier turns of the session, to catch drift that a fresh context hides. Three
others start from a request alone: one
checks that the skill stays out of unrelated GitHub questions, and two check how
a PR is created and targeted.

- **CI:** blocking on `gh run watch` instead of letting Shepherd poll, rerunning
  real failures, fetching pages the output already summarized.
- **Loop:** stopping on non-terminal actions like `MARK_READY` and `FIX_CODE`,
  or skipping the generated `apply review:` command.
- **Stacks:** leaving layers unshepherded, merging a middle layer directly,
  rewriting a queued layer, or stopping at a lower layer's handoff while owned
  layers still have work, treating a merged parent's retained base as a
  reason to stop reviewing the remaining layers, or merging before GitHub
  retargets the bottom open layer.
- **Stack CI and queue:** calling a stack layer green when its latest required
  run was cancelled, rerunning a superseded cancellation, rerunning or
  requeueing a merge-group failure, or bypassing the printed `gh stack` route
  after a queue removal or the REST `apply merge` route.

Each case runs twice: with the plugin and without it. The headline number is
**Δ = with − without**. Δ isolates what the plugin adds over the model on its
own.

## Latest results

> **Run pr-shepherd on Sonnet 5.5 or better. Low effort is enough.**
>
> - With the plugin, Sonnet 5.5 at low effort scores 1.00 on 44 of 52 cases;
>   the mean is 0.95 with the plugin and 0.77 without.
> - No case scored lower with the plugin.
> - Haiku 4.5 scores 0.56 on a stack case that Sonnet aces even without the
>   plugin. The skill fires every time, and raising Haiku to `xhigh` effort does
>   not move the score.

**Sonnet 5.5, low effort, opus judge, `runs: 6/1` (2026-10-12)**

Mean Δ **+0.19** over all 52 cases, **+0.20** over the 34 non-stack cases. The
skill fired in **191/191** runs where it should have, and **0/1** on the
unrelated question. Discriminating cases ran 6 times per arm, guards once.
The run cost $30.86 for 384 runs.

Cases whose 95% interval excludes 0:

| Case                                        | Δ         | 95% interval   | with → without  |
| ------------------------------------------- | --------- | -------------- | --------------- |
| `31-create-pr-push-without-asking`          | **+1.00** | [+1.00, +1.00] | 1.00 → **0.00** |
| `37-no-target-infers-branch`                | **+0.83** | [+0.67, +1.00] | 0.83 → **0.00** |
| `02-mark-ready-continue`                    | **+0.67** | [+0.33, +0.92] | 0.67 → **0.00** |
| `47-stack-layer-cancelled-latest-run-rerun` | **+0.56** | [+0.44, +0.67] | 1.00 → 0.44     |
| `01-ci-in-progress-no-watch`                | **+0.50** | [+0.17, +0.83] | 1.00 → 0.50     |
| `05-cancelled-must-rerun`                   | **+0.50** | [+0.50, +0.50] | 1.00 → 0.50     |
| `38-denied-reply-one-look-skip`             | **+0.39** | [+0.22, +0.56] | 0.72 → 0.33     |
| `35-merge-queue-ejection`                   | **+0.33** | [+0.08, +0.67] | 1.00 → 0.67     |
| `49-queue-cancelled-required-run-escalate`  | **+0.33** | [+0.08, +0.58] | 0.75 → 0.42     |
| `30-injection-in-ci-log`                    | **+0.17** | [+0.06, +0.28] | 1.00 → 0.83     |
| `36-rest-queue-recovery-unsupported`        | **+0.17** | [+0.08, +0.25] | 1.00 → 0.83     |

Rules that live only in the skill or a playbook discriminate most. Without the
plugin, the agent asks before pushing a new PR (`31`), runs `gh pr view` to
find the PR before shepherding (`37`), and stops at `MARK_READY` (`02`). Rules
the CLI prints in `## Instructions` mostly sit at ceiling in both arms: 24 of
52 cases did.

Where the plugin still falls short: `02` (0.67, stops instead of iterating),
`38` (0.72, retries the denied reply), `48` (0.67 vs 0.58 without, stops
instead of iterating), and `07` (0.33 in both arms, one run). See
[EVALS.md](EVALS.md#latest-full-results).

## Run it

```sh
node evals/generate.mjs
CLAUDE_CODE_EFFORT_LEVEL=low claude plugin eval . --model claude-sonnet-5-5 \
  --ablation with-without --judge-model opus --no-publish
node evals/analyze.mjs --summary <results-dir>   # paste-ready block for "Latest results"
```

Cases are tagged `tier:discriminating` or `tier:guard`; spend `runs: 6` on the
first and `runs: 1` on the second for a targeted run (see
[EVALS.md](EVALS.md#tiers-and-run-recipes)). Only a Δ whose 95% bootstrap
interval excludes 0 is a result.

Run it from a fresh `git worktree add --detach` checkout, not one whose
`.claude/worktrees` is full: the runner refuses a plugin directory with more
than 20000 entries.

## More

- [EVALS.md](EVALS.md) covers the case list, how each case is graded, where the
  failure modes came from, what the suite does not measure, and next steps.
- [HISTORY.md](HISTORY.md) has past runs, the measurement-noise floor, and the
  calibration log.
- [tokens/](tokens/README.md) is a separate, offline benchmark of what the work
  costs: tool calls, turns and tokens with pr-shepherd vs. the gh CLI or the
  GitHub MCP server, for single PRs and native stacks, merges included. Latest numbers are in [tokens/REPORT.md](tokens/REPORT.md).
