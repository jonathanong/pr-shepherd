# Eval history

This log only grows: past results, calibration fixes, and why they happened. Numbers
here are **not comparable to the current suite**. Grader and model changes
invalidate cross-run comparison, and `analyze.mjs` refuses such pairs. For the
current results see [README.md](README.md). For the suite design see
[EVALS.md](EVALS.md).

## 2026-09-30: Sonnet 5.5 at low effort, stack cases

- The agent model moved from `claude-opus-5` in the case frontmatter (overridden
  per tier by `--model`) to `claude-sonnet-5-5`. Effort is now requested through
  the case's `env:` block (`CLAUDE_CODE_EFFORT_LEVEL: low`) instead of the inert
  ambient `CLAUDE_EFFORT` (see "Effort" below).
- Added cases `14`–`22` (native stacked PRs) and `23` (behind-base rebase hint).
  The stack failures come from agent-blackboard session history:
  - layers left unshepherded ("why isn't anyone shepherding 9673 and 9677"),
  - merge-order confusion ("if the lower stacks are ready, merge it first"),
  - an agent losing track of a stack after one layer,
  - a rebase instruction ignored ("pr-shepherd tells you to rebase. why didn't
    you follow?").
- The generator was split into `lib.mjs` and `cases/*.mjs`.
- Every earlier result below predates this change.

## Before 2026-09-30

The commands these runs used:

```sh
CLAUDE_EFFORT=low claude plugin eval . --model sonnet --ablation with-without \
  --judge-model opus --no-publish
CLAUDE_EFFORT=max claude plugin eval . --model haiku --ablation with-without \
  --judge-model opus --no-publish
```

opus was also run as an agent tier and then dropped. It was flat against sonnet
and more useful in the judge seat.

### Historical results (before the 06/07 behavior change)

#### sonnet @ low — mean Δ **+0.28** over 13 cases, **+0.41** over 9 non-ceiling

| Case                           | Δ         | with → without  |
| ------------------------------ | --------- | --------------- |
| `02-mark-ready-continue`       | **+1.00** | 1.00 → **0.00** |
| `01-ci-in-progress-no-watch`   | **+0.83** | 0.83 → **0.00** |
| `10-external-check-no-handoff` | **+0.67** | 1.00 → 0.33     |
| `05-cancelled-must-rerun`      | **+0.50** | 1.00 → 0.50     |
| `06-escalate-stop-and-ask`     | +0.27     | 1.00 → 0.73     |
| `08-mergeability-diagnosis`    | +0.13     | 1.00 → 0.87     |

The top two are the highest-frequency real failures in the transcript corpus
(below). On both the baseline scores **0.00** and the plugin takes it to ~1.0.

Four cases held a consistent positive Δ across four independent runs (sonnet and
opus, two rounds each): `01`, `02`, `05`, `10`. Those are the load-bearing
results; the rest move inside run-to-run noise at `runs: 3`. A fifth run
(below) put a number on that noise — **±0.44 on a single case** — so read every
Δ in this table except `01` and `02` as indicative only.

#### Replication after a sibling skill landed — and the noise floor it exposed

`#426` added a second skill (`reduce-pr-noise`) to the same plugin without a
version bump, which is the case `analyze.mjs`'s plugin guard cannot see. The
suite was re-run at sonnet@low against `main` to check whether the sibling steals
activations from `pr-shepherd`. It does not: under a **strictly narrower**
`skill-fired` grader (the post-review version, which matches `pr-shepherd`
specifically rather than any skill) the new run counted **32/36** activations
against the older run's **31/36** under the broader matcher. No activation theft
is detectable, and the measurement errs in the conservative direction. Over-trigger
stayed **0/3**.

**The stored `sonnet-low` aggregate predates the current graders.** `analyze.mjs`
refuses to compare it: `skill-fired` changed in all 13 cases (display-only, no
score effect) and the scored graders `keeps-the-thread-id` (`03`) and
`issues-the-rerun` (`05`) changed too. Those two cases are genuinely
incomparable; the remaining eleven are not.

The accidental value of the re-run is a **measurement-noise control**. Nothing
about the _without_ arm changed between the two runs — no plugin either time,
same prompts, same opus judge — so its per-case movement is pure noise:

|                  | `01` | `02` | `11` | `09` | `13` | `08`  | `12`  | `04`  | `06`  | `10`  | `07`      |
| ---------------- | ---- | ---- | ---- | ---- | ---- | ----- | ----- | ----- | ----- | ----- | --------- |
| without-arm move | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | +0.13 | +0.17 | −0.17 | +0.20 | +0.33 | **−0.44** |

A single case swings **±0.44 at `runs: 3` with zero treatment change**; mean
|move| is 0.13 over 11 cases. That calibrates every other number here:

- mean Δ **+0.28 → +0.23** between the two runs is _noise_, not a movement.
- `02`'s Δ +1.00 → +0.67 is noise. `07`'s Δ 0.00 → +0.22 is noise — `07` is the
  noisiest case in the suite and should not be cited from a single round.
- **`01` and `02` are the only clean signal.** Their without-arm is pinned at
  **0.00** in both runs while the with-arm holds 0.83 / 0.67. A floor that does
  not move under resampling is the robust result — and they are the same two
  cases that dominate the real-traffic failure corpus.

Practical consequence: do not add tiers to tighten this. The limiting factor is
`runs: 3`, not baseline validity. Raise `runs` on `01`, `02`, `05`, `10`.

#### haiku @ max — mean Δ **+0.02**. Out of range.

Absolute _with_-arm scores: **0.00** on mark-ready, **0.14** on multi-category,
**0.17** on real-failure. Haiku cannot do the task with the plugin, so there is
nothing for the playbooks to add. This is a capability floor, not missing
knowledge.

A second, separable problem: the skill fired in only **19/36** with-arm runs
(53%), all-or-nothing per case — it never fired on `05`, `06`, `07`, `08` or
`09`. On those five the "with" arm received no treatment, so the _expected_
effect there is zero. Note this is an expectation, not a mechanism: the two arms
are still separate stochastic runs and can score differently by chance, so the
trigger misses explain the small aggregate Δ only in expectation. Establishing
the attribution properly would need paired runs or an uncertainty estimate,
neither of which this suite produces at `runs: 3`.

> Do **not** read the raw split "fired → mean 0.29 / did not fire → mean 0.59" as
> the skill harming haiku. It is confounded by difficulty: the non-firing cases
> are the easy ones (`09` scores 1.00 in both arms). Only one case had mixed
> firing, far too little to test within-case.

#### Effort: `CLAUDE_EFFORT` does not reach the child runs

Tested at both tiers. sonnet at `low` and `xhigh` gave an identical mean Δ
(+0.28). haiku — far from ceiling, so any real effort difference should show — gave:

|               | mean Δ | skill fired | cost  |
| ------------- | ------ | ----------- | ----- |
| haiku @ `max` | +0.02  | 19/36 (53%) | $5.92 |
| haiku @ `low` | +0.01  | 20/36 (56%) | $5.76 |

Identical scores, identical trigger rate, and **cost within 3%**. That last point
is the decisive one: maximum effort should burn materially more thinking tokens
than low. It does not, so the variable is not being applied to the child runs.

`plugin eval` has no `--effort` flag and evidently does not inherit the ambient
one. **Treat reasoning effort as untestable here** and vary only `--model`. The
`CLAUDE_EFFORT=` prefixes in the commands above are harmless but currently inert;
they are retained so the intent is explicit if a future version adds passthrough.

### Calibration log

**Pilot 1 — mean Δ 0.00, `Skill called 0x` on every case.** The framing said "do
not run commands or read files", which the model read as "use no tools at all".
It never loaded the skill, so both arms were identical. Fixed by adding "You MAY
use any skill available to you".

**Pilot 1 also invalidated two fixtures and three graders.** Fixture `11` cannot
carry a rerun-vs-fix test — its only detail is the step name `> Run tests`, so an
agent wanting logs first is correct; replaced with `61`, which has
`##[error]Process completed with exit code 1`. Fixtures `18` and `19` are
degenerate: the suggested replacement is byte-identical to the line it replaces,
so "no change warranted" is right and the suggestion case was dropped rather than
graded against a no-op.

**Pilot 2 — a `not_contains` regex scored −0.33 against the with-arm as a false
positive.** With playbooks loaded the agent correctly described the next tick's
procedure while inventing no mutation, which the rubric passed 3–0. The regex
punished the string, not the behaviour.

**Full run 1 — two rubrics masked the strongest finding.** `iterates-immediately`
required the plan to _"end by"_ iterating, which is right for `FIX_CODE` but wrong
for `WAIT`/`MARK_READY` where re-running as step 1 is correct.
`treats-mark-ready-as-non-terminal` said "Nothing is being asked here except to
continue", inviting the judge to fail any elaborate answer. Underneath them,
`does-not-block-on-a-ci-watcher` was already 3/3 with vs 0/3 without.

The rule, learned three times: **absence checks on natural-language behaviour
belong in a rubric, not a pattern.** Regex works for _presence_ of a specific
token (`gh run rerun 555`); a declined action must be judged, because the framing
explicitly asks the agent to state what it chose not to do.

**A negative Δ that was not stable.** `07-escalate-beats-available-work` scored
Δ −0.44 at sonnet in round 1, with the with-arm reasoning _"the bot review isn't
noise to dismiss … fix first, then dismiss/reply, then resume Shepherd"_ —
overriding the printed _"Stop polling. Ask the user."_ It looked like the
playbooks defeating an `ESCALATE` stop. Round 2 showed it 1/3 and opus went +0.22
then −0.22. **Treat it as variance, not a finding**, unless a higher-`runs` run
reproduces it.

**An opus round was contaminated** by `You've hit your session limit`, which
failed three judge calls and scored them 0, manufacturing a fake +1.00. Check for
`grader threw` in `aggregate-result.json` before trusting any anomalous Δ.

