# pr-shepherd evals

**Does an agent with the pr-shepherd plugin get pull requests ready to merge
better than an agent with only GitHub's own tools?**

The outcome suite answers that. Each of its 71 scenarios is one PR state: review
feedback, CI failures, merge gates and branch updates, the merge queue, safety
and terminal states, stacked PRs, and a few where the user only says "merge". Both arms get the `gh` CLI and the GitHub MCP
server, answered from that state. Only the plugin arm also gets the plugin's
skills and the pr-shepherd CLI. One tool-neutral grader judges what each
agent did and committed to. The headline is **Δ = plugin − gh/MCP**.

## Latest results

> **Sonnet 5.5, opus judge, 70 of 71 scenarios scored, 3 runs per arm
> (2026-11-21):** mean score 0.90 with the plugin and 0.49 with `gh` and the
> GitHub MCP server. Δ **+0.41** [+0.30, +0.52]. A full run of all 71 scenarios
> plus a follow-up that reran 75 and added runs to 12, 22 and 72. The tables
> come from one harness version except 75's grader, merged by `add-runs.mjs` and
> produced by `analyze.mjs` from kept traces. The intervals resample scenarios
> and runs.

| Category                | Plugin | gh/MCP | Δ     | 95% CI         |
| ----------------------- | ------ | ------ | ----- | -------------- |
| Review feedback         | 0.92   | 0.67   | +0.26 | [+0.06, +0.47] |
| CI                      | 0.96   | 0.50   | +0.46 | [+0.25, +0.69] |
| Merge gates & branch    | 0.88   | 0.82   | +0.06 | [-0.11, +0.24] |
| Merge queue             | 1.00   | 0.17   | +0.83 | [+0.50, +1.00] |
| Safety & terminal       | 1.00   | 0.92   | +0.08 | [+0.00, +0.33] |
| Stacks                  | 0.96   | 0.16   | +0.80 | [+0.64, +0.93] |
| Creating PRs            | 1.00   | 0.33   | +0.67 | [+0.00, +1.00] |
| Trigger (no skill hint) | 0.00   | 0.00   | +0.00 | [+0.00, +0.00] |
| **All**                 | 0.90   | 0.49   | +0.41 | [+0.30, +0.52] |

The Trigger rows measure whether the agent uses the plugin when the user only says
"Merge <PR>", not the plugin's effect: the skill loaded in 0 of 9 plugin runs.
22 is the first scenario the plugin loses (0.00 vs 0.50). Scenario 36 is not scored:
its gh/MCP runs errored in the eval runner. Every scenario is in
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
