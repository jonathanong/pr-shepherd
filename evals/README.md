# pr-shepherd evals

**Does an agent act correctly on pr-shepherd's output, and would it without the
plugin?**

22 cases replay real recorded pr-shepherd output from the states agents most
often get wrong in real transcripts. A 23rd case checks that the skill stays
out of unrelated GitHub questions.

- **CI:** blocking on `gh run watch` instead of letting Shepherd poll, rerunning
  real failures, fetching pages the output already summarized.
- **Loop:** stopping on non-terminal actions like `MARK_READY` and `FIX_CODE`,
  or skipping the generated `apply review:` command.
- **Stacks:** leaving layers unshepherded, merging a middle layer directly,
  rewriting a queued layer, or stopping at a lower layer's handoff while owned
  layers still have work.

Each case runs twice: with the plugin and without it. The headline number is
**Δ = with − without**. Δ isolates what the plugin adds over the model on its
own.

## Latest results

> **Run pr-shepherd on Sonnet 5.5 or better. Low effort is enough.**
>
> - Sonnet 5.5 at low effort scores 1.00 with the plugin on 17 of 23 cases.
> - Haiku 4.5 scores 0.56 on a stack case that Sonnet aces even without the
>   plugin. The skill fires every time, and raising Haiku to `xhigh` effort does
>   not move the score.

**Sonnet 5.5, low effort, opus judge, `runs: 3` (2026-09-30)**

Mean Δ **+0.09** over all 23 cases, **+0.13** over the 14 single-PR cases. The
skill fired in **64/66** runs where it should have, and **0/3** on the unrelated
question.

| Case                                 | Δ         | with → without  |
| ------------------------------------ | --------- | --------------- |
| `01-ci-in-progress-no-watch`         | **+1.00** | 1.00 → **0.00** |
| `02-mark-ready-continue`             | **+0.50** | 0.83 → 0.33     |
| `05-cancelled-must-rerun`            | **+0.50** | 1.00 → 0.50     |
| `10-external-check-no-handoff`       | **+0.33** | 1.00 → 0.67     |
| `22-stack-auto-ready-disabled-probe` | **+0.27** | 1.00 → 0.73     |

Without the plugin, the agent blocks on `gh run watch` in every run of `01`,
which is still the most frequent failure in real transcripts.

The stack cases (`14`–`22`) score 1.00 in both arms except `22`. The stack
output's own `## Instructions` are complete enough that the model follows them
unaided. Three cases score lower with the plugin; see
[EVALS.md](EVALS.md#latest-full-results).

## Run it

```sh
node evals/generate.mjs
CLAUDE_CODE_EFFORT_LEVEL=low claude plugin eval . --model claude-sonnet-5-5 \
  --ablation with-without --judge-model opus --no-publish
```

## More

- [EVALS.md](EVALS.md) covers the case list, how each case is graded, where the
  failure modes came from, what the suite does not measure, and next steps.
- [HISTORY.md](HISTORY.md) has past runs, the measurement-noise floor, and the
  calibration log.
