# pr-shepherd evals

**Does an agent act correctly on pr-shepherd's output, and would it without the
plugin?**

54 cases replay real recorded pr-shepherd output, mostly from the states agents
get wrong in real transcripts. Five of those (`38`, `39`, `44`–`46`) also replay
earlier turns of the session, to catch drift that a fresh context hides. Three
others start from a request alone: one
checks that the skill stays out of unrelated GitHub questions, and two check how
a PR is created and targeted.

- **CI:** blocking on `gh run watch` instead of letting Shepherd poll, rerunning
  real failures, fetching pages the output already summarized.
- **Loop:** stopping on non-terminal actions like `MARK_READY` and `TRIAGE`,
  skipping the generated `apply review:` command, or fetching review items
  Shepherd held back for a later tick.
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

> **Sonnet 5.5, low effort, opus judge, all 57 cases (2026-11-09, after the
> tier retag):** mean score 0.98 with the plugin and 0.85 without, 87% fewer
> misses. Weighted mean Δ **+0.12** [+0.10, +0.13]: GitHub gotchas +0.11
> [+0.09, +0.13], loop rules +0.22 [+0.17, +0.27], safety +0.07 [+0.03, +0.11].
> The skill fired in 260/264 runs where it should and 0/3 on the unrelated
> question.

11 cases favor the plugin (interval above 0), led by `37` (run with no target,
1.00 → 0.00), `31` (create a PR without asking, 1.00 → 0.00) and `47` (a stack
layer's latest required run was cancelled, 1.00 → 0.33). No case favored the
without-plugin arm. The run cost $115.02 for 534 runs and took about 6 minutes
in four shards. Full table and findings: [EVALS.md](EVALS.md).

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
[RUNNING.md](RUNNING.md#tiers-and-run-recipes)). Only a Δ whose 95% bootstrap
interval excludes 0 is a result.

Run it from a fresh `git worktree add --detach` checkout, not one whose
`.claude/worktrees` is full: the runner refuses a plugin directory with more
than 20000 entries.

## More

- [EVALS.md](EVALS.md) has the latest results.
- [RUNNING.md](RUNNING.md) covers commands, tiers, weighting and environment
  constraints; [CASES.md](CASES.md) the case list and where each case came from;
  [NEXT-STEPS.md](NEXT-STEPS.md) open work.
- [HISTORY.md](HISTORY.md) has past runs, the measurement-noise floor, and the
  calibration log.
- [tokens/](tokens/README.md) is a separate, offline benchmark of what the work
  costs: tool calls, turns and tokens with pr-shepherd vs. the gh CLI or the
  GitHub MCP server, for single PRs and native stacks, merges included. Latest numbers are in [tokens/REPORT.md](tokens/REPORT.md).
