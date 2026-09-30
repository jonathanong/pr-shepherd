# pr-shepherd evals

**Does an agent act correctly on pr-shepherd's output, and would it without the
plugin?**

23 cases replay real recorded pr-shepherd output from the states agents most
often get wrong in real transcripts:

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

**Sonnet 5.5, low effort, opus judge, `runs: 3` (2026-09-30)**

_Pending: the first run against the 23-case suite has not been recorded yet._

## Run it

```sh
node evals/generate.mjs
claude plugin eval . --model claude-sonnet-5-5 --ablation with-without \
  --judge-model opus --no-publish
```

## More

- [EVALS.md](EVALS.md) covers the case list, how each case is graded, where the
  failure modes came from, what the suite does not measure, and next steps.
- [HISTORY.md](HISTORY.md) has past runs, the measurement-noise floor, and the
  calibration log.
