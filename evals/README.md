# pr-shepherd evals

**Does an agent with the pr-shepherd plugin get pull requests ready to merge
better than an agent with only GitHub's own tools?**

The outcome suite answers that. Each of its 73 scenarios is one PR state: review
feedback, CI failures, merge gates and branch updates, the merge queue, safety
and terminal states, stacked PRs, and a few where the user only says "merge". Both arms get the `gh` CLI and the GitHub MCP
server, answered from that state. Only the plugin arm also gets the plugin's
skills and the pr-shepherd CLI. One tool-neutral grader judges what each
agent did and committed to. The headline is **Δ = plugin − gh/MCP**.

## Latest results

> **Sonnet 5.5, opus judge, 71 of 72 scenarios scored, 3 runs per arm
> (2026-11-23):** mean score 0.95 with the plugin and 0.57 with `gh` and the
> GitHub MCP server. Δ **+0.38** [+0.28, +0.49]. One full run of all 72
> scenarios at deaa0744, from one harness version, produced by `analyze.mjs`
> from the kept traces. The intervals resample scenarios and runs. Scenario 77
> was added after that run, and 76 was in it.
>
> Four partial reruns followed the same day (A to D, 3 runs per arm, 35, 6, 2
> and 4 scenarios). Each scenario's latest figure is in [EVALS.md](EVALS.md).
> Taking those, the 72 scored scenarios average plugin 0.98, gh/MCP 0.55, Δ
> +0.42. That is a **composite of several runs, not a single run**, so it has no
> interval. 36 is the unscored one. The category table below is the full run's.
> 77 is a playbook-following check: its baseline cannot realistically pass.

| Category                | Plugin | gh/MCP | Δ     | 95% CI         |
| ----------------------- | ------ | ------ | ----- | -------------- |
| Review feedback         | 0.97   | 0.67   | +0.30 | [+0.06, +0.58] |
| CI                      | 0.92   | 0.53   | +0.39 | [+0.20, +0.59] |
| Merge gates & branch    | 1.00   | 0.88   | +0.12 | [+0.00, +0.29] |
| Merge queue             | 1.00   | 0.25   | +0.75 | [+0.25, +1.00] |
| Safety & terminal       | 1.00   | 0.83   | +0.17 | [+0.00, +0.50] |
| Stacks                  | 0.89   | 0.39   | +0.50 | [+0.28, +0.72] |
| Creating PRs            | 1.00   | 0.22   | +0.78 | [+0.33, +1.00] |
| Trigger (no skill hint) | 1.00   | 0.33   | +0.67 | [+0.00, +1.00] |
| **All**                 | 0.95   | 0.57   | +0.38 | [+0.28, +0.49] |

The Trigger rows measure whether the agent uses the plugin when the user only says
"Merge <PR>", not the plugin's effect: the skill loaded in 3 of 3 kept plugin runs
for each of the three scenarios. Scenario 76 (a head pushed seconds ago, no checks
registered yet) scored 1.00 / 0.33 in the full run and 1.00 / 0.00 in rerun A, and the baseline number is not stable.
Scenario 36 is not scored: all three of its gh/MCP runs were voided by the eval
runner (a deferred tool called before it was loaded). Several gh/MCP numbers are
not trustworthy (24, 49, 76, and the 0.6 ceiling on the stack-merge rows; 77, 48 and 50 measure playbook-following). Every scenario is in
[EVALS.md](EVALS.md); read its "Known problems with these numbers" first.

## Run it

```sh
node evals/outcomes/generate.mjs --out evals-outcomes
claude plugin eval evals-outcomes --model claude-sonnet-5-5 --judge-model opus --no-publish \
  --ablation with-without --keep-temp --eval-dir cases --output-dir evals/results/outcomes
node evals/outcomes/analyze.mjs evals/results/outcomes/aggregate-result.json
```

`evals-outcomes/` is an eval copy of the plugin (the real skills plus one mocked
Shepherd CLI), not the repository root. The baseline arm has no pr-shepherd at all.
Outcome results recorded between v2.2.4 (#757, which removed the plugin's MCP
server) and this fix are invalid: the pr-shepherd mock tools were served in both
arms. The numbers above were taken after that fix.

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
