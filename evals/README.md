# pr-shepherd evals

**Does an agent with the pr-shepherd plugin get pull requests ready to merge
better than an agent with only GitHub's own tools?**

The outcome suite answers that. Each of its 33 scenarios is one PR state: review
feedback, CI failures, merge gates and branch updates, the merge queue, safety
and terminal states, and stacked PRs. Both arms get the `gh` CLI and the GitHub MCP
server, answered from that state. Only the plugin arm also gets the skill and
the pr-shepherd CLI and MCP tools. One tool-neutral grader judges what each
agent did and committed to. The headline is **Δ = plugin − gh/MCP**.

## Latest results

> **Sonnet 5.5, opus judge, 56 scenarios, 3 runs per arm (2026-11-15):** mean
> score 0.96 with the plugin and 0.47 with `gh` and the GitHub MCP server.
> Δ **+0.49**. This is one full run of every scenario; 46 and 47 come from
> their rerun after the cancel-step fix.

| Category             | Plugin | gh/MCP | Δ     | 95% CI         |
| -------------------- | ------ | ------ | ----- | -------------- |
| Review feedback      | 1.00   | 0.79   | +0.21 | [+0.13, +0.25] |
| CI                   | 0.95   | 0.55   | +0.40 | [+0.31, +0.48] |
| Merge gates & branch | 0.96   | 0.54   | +0.42 | [+0.33, +0.50] |
| Merge queue          | 1.00   | 0.00   | +1.00 | [+1.00, +1.00] |
| Safety & terminal    | 1.00   | 0.75   | +0.25 | [+0.25, +0.25] |
| Stacks               | 0.96   | 0.22   | +0.73 | n/a            |
| Creating PRs         | 0.89   | 0.56   | +0.33 | [+0.11, +0.56] |

No run in either arm obeyed a planted instruction. One scenario (18) favors
`gh`/MCP, 0.67 vs 1.00, which reads as variance so far. Every scenario and
the caveats are in [EVALS.md](EVALS.md).

## Run it

```sh
node evals/outcomes/generate.mjs --out evals-outcomes
claude plugin eval . --model claude-sonnet-5-5 --judge-model opus --no-publish \
  --keep-temp --eval-dir evals-outcomes --output-dir evals/results/outcomes
node evals/outcomes/analyze.mjs evals/results/outcomes/aggregate-result.json
```

Each scenario is tagged with its slug, so `--tag <slug>` (repeatable) reruns a
few. See [RUNNING.md](RUNNING.md#outcome-suite).

## Regression guard

The fixture suite (`evals/cases/`, generated into `evals/`) replays recorded
Shepherd output and checks that the skill acts on it. It guards the CLI's
output and the skill against regressions; its results are not reported here.
When CLI output changes, regenerate the recorded prompts and token report
before pushing. `npm test` does not check whether these generated files are in
sync.

```sh
node evals/generate.mjs
node evals/tokens/bench.mjs
node evals/tokens/bench.mjs --check
CLAUDE_CODE_EFFORT_LEVEL=low claude plugin eval . --model claude-sonnet-5-5 \
  --ablation with-without --judge-model opus --no-publish
```

Cases are tagged `tier:discriminating` or `tier:guard` (see
[RUNNING.md](RUNNING.md#tiers-and-run-recipes)). Run it from a fresh
`git worktree add --detach` checkout, not one whose `.claude/worktrees` is
full: the runner refuses a plugin directory with more than 20000 entries.

## More

- [EVALS.md](EVALS.md) has the latest results.
- [RUNNING.md](RUNNING.md) covers commands, tiers, weighting and environment
  constraints; [CASES.md](CASES.md) the fixture case list;
  [NEXT-STEPS.md](NEXT-STEPS.md) open work.
- [HISTORY.md](HISTORY.md) has past runs, including the fixture suite's.
- [tokens/](tokens/README.md) is a separate, offline benchmark of what the work
  costs: tool calls, turns and tokens with pr-shepherd vs. the gh CLI or the
  GitHub MCP server, for single PRs and native stacks, merges included. Latest
  numbers are in [tokens/REPORT.md](tokens/REPORT.md).
