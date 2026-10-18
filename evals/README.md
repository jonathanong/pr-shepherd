# pr-shepherd evals

**Does an agent act correctly on pr-shepherd's output, and would it without the
plugin?**

49 cases replay real recorded pr-shepherd output, mostly from the states agents
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

> **The plugin's job is the GitHub gotchas: cancelled runs, merge queues,
> stacks and review mechanics.** There Sonnet 5.5 scores **0.94** with the
> plugin and 0.82 without it (Δ +0.12 [+0.10, +0.15]), about two-thirds fewer
> missed checks. On the eight gotcha cases where the model trips without it,
> the score goes from 0.50 to 0.92. No case has a regression whose
> interval excludes 0.

**Sonnet 5.5, low effort, opus judge, `runs: 6` on all 52 cases (2026-10-12)**

GitHub gotchas where the plugin changes the outcome (95% interval excludes 0):

| Case | The trap                                                              | with → without |
| ---- | --------------------------------------------------------------------- | -------------- |
| `47` | A stack layer reads "3 passing", but its latest required run was cancelled | 1.00 → 0.44    |
| `07` | A bot review and a human thread arrive in the same `FIX_CODE`         | 0.89 → 0.33    |
| `05` | A cancelled run has to be rerun, not treated as a failure             | 1.00 → 0.50    |
| `21` | Every stack layer is terminal, so the stack loop must stop            | 1.00 → 0.50    |
| `38` | GitHub denied a reply; skip it once, don't retry                       | 0.72 → 0.33    |
| `35` | A PR was ejected from the merge queue                                 | 1.00 → 0.67    |
| `49` | A merge-group run was cancelled; escalate, don't requeue              | 0.75 → 0.42    |
| `36` | The REST transport cannot run the queue recovery                      | 1.00 → 0.83    |

Gotchas still weak with the plugin (with-plugin score below 0.8):
`06` (0.47, dismissing a stale bot review), `48` (0.67, a superseded
cancellation on a stack layer), `38`, `49`, `27` and `28` (a merged stack
parent). These are the next targets.

The other 22 of 36 gotcha cases sit at or near ceiling in both arms: the CLI's
own `## Instructions` carry them, plugin or not.

| Area                | Weight | Mean Δ                  |
| ------------------- | ------ | ----------------------- |
| GitHub gotchas (36) | ×3     | **+0.12** [+0.10, +0.15] |
| Safety (4)          | ×2     | +0.04 [+0.01, +0.07]    |
| Loop rules (12)     | ×1     | +0.32 [+0.25, +0.40]    |
| **Weighted, all 52** |       | **+0.14** [+0.11, +0.16] |

Loop rules (create a PR without asking, run without a PR id, keep going after
`MARK_READY`) show the biggest Δ, but a miss there costs a turn, not a bad
GitHub action. The skill fired in 306/306 runs where it should have and 0/6 on
the unrelated question. The two runs cost $51.26 in total. Full table:
[EVALS.md](EVALS.md#latest-full-results).

## Run it

When CLI output changes, regenerate the recorded prompts and token report before
pushing. `npm test` does not check whether these generated files are in sync.

```sh
node evals/generate.mjs
node evals/tokens/bench.mjs
node evals/tokens/bench.mjs --check
```

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
