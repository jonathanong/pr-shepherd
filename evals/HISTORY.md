# Eval history

This log only grows: past results, calibration fixes, and why they happened. Numbers
here are **not comparable to the current suite**. Grader and model changes
invalidate cross-run comparison, and `analyze.mjs` refuses such pairs. For the
current results see [README.md](README.md). For the suite design see
[RUNNING.md](RUNNING.md) and [CASES.md](CASES.md).

## 2026-10-12: full results at `runs: 6`

Sonnet 5.5, `CLAUDE_CODE_EFFORT_LEVEL=low`, opus judge, 2026-10-12, on `main`
at `dcbd17f6` (plugin source `58bc3cb0e895`), `runs: 6` on all 52 cases. Two
runs on the same plugin source make up this table: the targeted run (the 28
discriminating cases at `runs: 6`, guards at `runs: 1`) and a rerun of the 24
single-run guards at `runs: 6`, whose results replace their single runs.
Together they cost $51.26 for 672 runs ($0.076 per run); the table counts
624, without the 48 single runs the rerun replaced. No
`grader threw`, no run errors.

| Case | runs | with | without | Δ     | Case | runs | with | without | Δ     |
| ---- | ---- | ---- | ------- | ----- | ---- | ---- | ---- | ------- | ----- |
| `01` | 6    | 1.00 | 0.50    | +0.50 | `27` | 6    | 0.79 | 0.79    | 0.00  |
| `02` | 6    | 0.67 | 0.00    | +0.67 | `28` | 6    | 0.78 | 0.67    | +0.11 |
| `03` | 6    | 1.00 | 1.00    | 0.00  | `29` | 6    | 1.00 | 1.00    | 0.00  |
| `04` | 6    | 1.00 | 0.92    | +0.08 | `30` | 6    | 1.00 | 0.83    | +0.17 |
| `05` | 6    | 1.00 | 0.50    | +0.50 | `31` | 6    | 1.00 | 0.00    | +1.00 |
| `06` | 6    | 0.47 | 0.40    | +0.07 | `32` | 6    | 0.96 | 0.83    | +0.13 |
| `07` | 6    | 0.89 | 0.33    | +0.56 | `33` | 6    | 1.00 | 0.89    | +0.11 |
| `08` | 6    | 1.00 | 1.00    | 0.00  | `34` | 6    | 1.00 | 1.00    | 0.00  |
| `09` | 6    | 0.92 | 0.83    | +0.08 | `35` | 6    | 1.00 | 0.67    | +0.33 |
| `10` | 6    | 1.00 | 1.00    | 0.00  | `36` | 6    | 1.00 | 0.83    | +0.17 |
| `11` | 6    | 0.50 | 0.17    | +0.33 | `37` | 6    | 0.83 | 0.00    | +0.83 |
| `12` | 6    | 0.92 | 1.00    | −0.08 | `38` | 6    | 0.72 | 0.33    | +0.39 |
| `13` | 6    | 1.00 | 1.00    | 0.00  | `39` | 6    | 1.00 | 1.00    | 0.00  |
| `14` | 6    | 1.00 | 1.00    | 0.00  | `40` | 6    | 1.00 | 1.00    | 0.00  |
| `15` | 6    | 1.00 | 1.00    | 0.00  | `41` | 6    | 1.00 | 1.00    | 0.00  |
| `16` | 6    | 1.00 | 1.00    | 0.00  | `42` | 6    | 1.00 | 1.00    | 0.00  |
| `17` | 6    | 1.00 | 1.00    | 0.00  | `43` | 6    | 1.00 | 0.94    | +0.06 |
| `18` | 6    | 1.00 | 1.00    | 0.00  | `44` | 6    | 1.00 | 1.00    | 0.00  |
| `19` | 6    | 1.00 | 1.00    | 0.00  | `45` | 6    | 1.00 | 1.00    | 0.00  |
| `20` | 6    | 1.00 | 1.00    | 0.00  | `46` | 6    | 1.00 | 0.92    | +0.08 |
| `21` | 6    | 1.00 | 0.50    | +0.50 | `47` | 6    | 1.00 | 0.44    | +0.56 |
| `22` | 6    | 1.00 | 0.93    | +0.07 | `48` | 6    | 0.67 | 0.58    | +0.08 |
| `23` | 6    | 1.00 | 1.00    | 0.00  | `49` | 6    | 0.75 | 0.42    | +0.33 |
| `24` | 6    | 1.00 | 0.92    | +0.08 | `50` | 6    | 1.00 | 0.92    | +0.08 |
| `25` | 6    | 1.00 | 0.67    | +0.33 | `51` | 6    | 1.00 | 0.94    | +0.06 |
| `26` | 6    | 0.94 | 0.67    | +0.28 | `52` | 6    | 1.00 | 1.00    | 0.00  |

Skill trigger: 306/306 on positive cases. Over-trigger (`13`): 0/6.

What the numbers say:

- **Weighted mean Δ +0.14 [+0.11, +0.16]** (github ×3, safety ×2, loop ×1; see
  [Weighted score](RUNNING.md#weighted-score)). By area: GitHub gotchas +0.12
  [+0.10, +0.15] over 36 cases, safety +0.04 [+0.01, +0.07] over 4, loop rules
  +0.32 [+0.25, +0.40] over 12. The plain mean is +0.16 [+0.14, +0.19].
- **13 cases separate the arms with an interval that excludes 0:** `01`, `02`,
  `05`, `07`, `21`, `30`, `31`, `35`, `36`, `37`, `38`, `47` and `49`. Eight of
  them are GitHub gotchas.
- **No case has a regression whose interval excludes 0.** `12` reads −0.08, one run in six,
  and its interval includes 0.
- **22 of the 36 gotcha cases sit at 0.9 or above in both arms.** The CLI's own
  `## Instructions` carry them, which dilutes the gotcha mean.
- **Weak with-arm gotchas:** `06` 0.47, `48` 0.67, `38` 0.72, `49` 0.75, `28`
  0.78 and `27` 0.79. Among loop rules, `11` is 0.50 and `02` 0.67.
- **Single-run promotions mostly held up at `runs: 6`.** `21` (+0.50) and `11`
  (+0.33) still separate; `06`, `18`, `27` and `28` fell back to within noise.
  `07` rose from 0.33 to 0.89 with the plugin.

Tiers were reset from this run: discriminating if the interval excludes 0 or
the with-arm is below 0.9; guard otherwise.

### Previous full run (2026-09-30, `runs: 3`)

Sonnet 5.5, `CLAUDE_CODE_EFFORT_LEVEL=low`, opus judge, 23 cases.
It took 732s at `-j 4` and cost $15.87. No `grader threw`, no run errors.

| Case | with | without | Δ     | Case | with | without | Δ     |
| ---- | ---- | ------- | ----- | ---- | ---- | ------- | ----- |
| `01` | 1.00 | 0.00    | +1.00 | `13` | 1.00 | 1.00    | 0.00  |
| `02` | 0.83 | 0.33    | +0.50 | `14` | 1.00 | 1.00    | 0.00  |
| `03` | 1.00 | 1.00    | 0.00  | `15` | 1.00 | 1.00    | 0.00  |
| `04` | 0.67 | 1.00    | −0.33 | `16` | 1.00 | 1.00    | 0.00  |
| `05` | 1.00 | 0.50    | +0.50 | `17` | 1.00 | 1.00    | 0.00  |
| `06` | 0.60 | 0.73    | −0.13 | `18` | 1.00 | 1.00    | 0.00  |
| `07` | 0.56 | 0.56    | 0.00  | `19` | 1.00 | 1.00    | 0.00  |
| `08` | 1.00 | 1.00    | 0.00  | `20` | 1.00 | 1.00    | 0.00  |
| `09` | 1.00 | 1.00    | 0.00  | `21` | 1.00 | 1.00    | 0.00  |
| `10` | 1.00 | 0.67    | +0.33 | `22` | 1.00 | 0.73    | +0.27 |
| `11` | 0.67 | 0.67    | 0.00  | `23` | 1.00 | 0.89    | +0.11 |
| `12` | 0.83 | 1.00    | −0.17 |      |      |         |       |

Skill trigger: 64/66 on positive cases (`09` fired 1/3). Over-trigger (`13`):
0/3.

What the numbers say:

- **Stack cases are at ceiling in both arms.** The stack overview's own
  `## Instructions` ("Owned layers can proceed concurrently", "Do not rewrite a
  queued layer", the printed `gh stack merge`) are enough on their own. That is
  a result about the CLI output, not the skill. Keep the cases as regression
  guards; a Δ there needs output that leans on a playbook.
- **`04` (−0.33) is a playbook gap, not noise.** The CI-triage playbook says to
  rerun "when the excerpt shows a transient failure" and to fix real failures.
  It is silent on the original attempt when the excerpt has no usable evidence
  (fixture `61` shows only `exit code 1`). The with-arm filled the gap with "no
  evidence of a code defect → run the authorized rerun once". Next step 11.
- **`06` (−0.13) and `12` (−0.17) are inside the ±0.44 noise floor.** In the
  `12` failures the agent opened the external provider page "to confirm". That
  is the behavior the case targets, so watch it across runs.
- **`01` is the clean signal again:** without-arm 0.00, with-arm 1.00.

### After the CI-triage fix (2026-09-30, Sonnet 5.5 low, `runs: 6`)

These are targeted reruns, not a full run. The table above is the pre-fix
plugin.

| Case | with | without | Δ         | Note                                              |
| ---- | ---- | ------- | --------- | ------------------------------------------------- |
| `04` | 1.00 | 0.75    | **+0.25** | was −0.33; gate-job rule added to the playbook    |
| `24` | 1.00 | 0.50    | **+0.50** | new; the first stack case that separates the arms |

On `24`, the without-arm declined to name the extension in 2 of 6 runs and
offered per-layer `gh pr merge` as a fallback in 4. The first run of `24`
scored the with-arm 0.67 because the rubric's "hand the merge to the human"
clause caught correct no-shell step lists. The rubric was clarified before the
numbers above.

### Transcript cases (2026-09-30, Sonnet 5.5 low, `runs: 3`)

Targeted runs for the cases from the second transcript pass.

| Case | with | without | Δ     | Note                                                  |
| ---- | ---- | ------- | ----- | ----------------------------------------------------- |
| `23` | 1.00 | 1.00    | 0.00  | rubric now also fails "asks before rebasing"; ceiling |
| `25` | 1.00 | 1.00    | 0.00  | ceiling even framed as a background-task notice       |
| `26` | 1.00 | 0.89    | +0.11 | inside noise once the prompt states the convention    |

`26` went through three versions, and the first number was misleading:

1. The skill said "when behind or conflicting, rebase and `--force-with-lease`".
   Δ **+0.89**: every without-arm run merged `main` in "so the push needs no
   force-push".
2. Review pointed out that this is routing keyed on CLI output, and that
   rebase-vs-merge is the repository's convention, which the CLI relays via
   `iterate.behind-base-hint` (on conflicts too, once #492 lands). The skill line
   became a permission only: lease-pushing your own rebased head needs no
   confirmation. The with-arm then chose merge in 2 of 3 runs (0.78 vs 0.11,
   Δ +0.67; every with-arm miss was the "merge instead of rebase" clause), and
   no with-arm run asked first.
3. The prompt now states the convention ("rebase, never merge the base in").
   Both arms rebase and lease-push; one without-arm run would still "confirm
   with you first". Δ +0.11.

So the +0.89 measured the rebase prescription, not the permission. With the
convention given, Sonnet 5.5 already rebases and lease-pushes unaided. `26`
stays as a regression guard for "ask before rebasing". On `23` the output
prints the rebase hint, so both arms follow it. `25`'s real failure comes from
long multi-PR sessions losing track, which a single-turn case cannot
reproduce; it stays as a regression guard too.

### Sonnet 5 vs Sonnet 5.5

Both runs use the same 23 cases, the same plugin (before the CI-triage fix),
low effort and the opus judge.

|                        | Sonnet 5 | Sonnet 5.5 |
| ---------------------- | -------- | ---------- |
| with-arm mean          | 0.84     | **0.92**   |
| without-arm mean       | 0.73     | **0.83**   |
| mean Δ                 | +0.11    | +0.09      |
| cases at 1.00 (with)   | 13       | 17         |
| skill fired (positive) | 56/66    | 64/66      |
| cost                   | $17.06   | $15.87     |

5.5 lifts both arms by about +0.1, so Δ holds steady. The plugin's
contribution does not shrink as the model improves. `02` and `05` keep their
Δ on both models. `01` is +0.50 on 5 and +1.00 on 5.5, because 5 sometimes
stopped instead of iterating.

Per-case moves under ±0.44 are noise at `runs: 3`. `04` went from +0.33 to
−0.33 and `06` from +0.67 to −0.13; don't read those as regressions without a
higher-`runs` rerun.

## 2026-10-12: guard rerun at `runs: 6`, weighted score

- Reran the 24 single-run guards at `runs: 6` ($20.40, mean Δ +0.09 over
  those 24), so every case now has an interval. Combined with the targeted run:
  plain mean Δ +0.16 over 52 cases, skill fired 306/306.
- Of the six single-run promotions, `21` and `11` held up; `06`, `18`, `27` and
  `28` moved by +0.25 or more on one run and fell back to within noise on six.
  `07` rose from 0.33 to 0.89 with the plugin and now separates.
- Added the per-case `area` tag and the weighted headline (github ×3, safety
  ×2, loop ×1): +0.14 overall, +0.12 on GitHub gotchas, +0.32 on loop rules.
- Tiers reset again: discriminating if the interval excludes 0 or the with-arm
  is below 0.9. `18` moved to guard.

## 2026-10-12: first targeted run, cases 29–52 live

- First run of the tiered recipe (`runs: 6` discriminating, `runs: 1` guard)
  and the first live run of cases `29`–`52`. Sonnet 5.5 low, opus judge, on
  `dcbd17f6`: 384 runs, $30.86, mean Δ +0.19 over 52 cases, no plugin
  regressions, skill fired 191/191.
- Eight new cases separate the arms: `30`, `31`, `35`–`38`, `47`, `49`.
- Former discriminating cases `04`, `10`, `22` and `24` no longer separate.
  The 2026-09-30 negatives on `04`, `06` and `12` did not recur.
- Tiers were reset from this run (see RUNNING.md "Tiers and run recipes"): 15
  cases moved to guard and 7 single-run or weak cases moved to discriminating.
- The recipe failed from the main checkout: the runner refuses a plugin
  directory with more than 20000 entries, and `.claude/worktrees` held about
  526k. It ran from a fresh detached worktree instead.

## 2026-09-30: Sonnet 5.5 at low effort, stack cases

- The agent model moved from `claude-opus-5` in the case frontmatter (overridden
  per tier by `--model`) to `claude-sonnet-5-5`. Effort is now requested with
  `CLAUDE_CODE_EFFORT_LEVEL=low` in the operator's shell instead of the inert
  ambient `CLAUDE_EFFORT` (see "Effort" below). A case's `env:` block cannot
  carry it: the runner allows only `EVAL_*` keys there.
- Added cases `14`–`22` (native stacked PRs) and `23` (behind-base rebase hint).
  The stack failures come from agent-blackboard session history:
  - layers left unshepherded ("why isn't anyone shepherding 9673 and 9677"),
  - merge-order confusion ("if the lower stacks are ready, merge it first"),
  - an agent losing track of a stack after one layer,
  - a rebase instruction ignored ("pr-shepherd tells you to rebase. why didn't
    you follow?").
- Added cases `25` (one PR's `CANCEL` ends only its loop) and `26` (conflicts:
  rebase and `--force-with-lease` without asking) from user corrections in
  Claude, Codex, Cursor and Grok transcripts. The skill and `AGENTS.md` now
  allow a `--force-with-lease` push of your own rebased PR head; before, every
  force-push was out of scope, and agents merged `main` in or asked first. `26`
  first scored Δ +0.89, but that measured a skill line prescribing rebase.
  After review moved the rebase-vs-merge choice back to the repository's
  convention (#492) and the prompt stated it, `26` scored +0.11 (noise). `23`
  (rubric tightened) and `25` sat at ceiling.
- The generator was split into `lib.mjs` and `cases/*.mjs`.
- First run: mean Δ +0.09 (23 cases), +0.13 over the 14 non-stack cases. The
  stack cases sat at ceiling in both arms. See "Previous full run" under
  "2026-10-12: full results" above.
- Effort check: `CLAUDE_CODE_EFFORT_LEVEL` in the shell moved agent cost +16%
  from low to high on case `16`, so unlike `CLAUDE_EFFORT` it appears live.
- Haiku 4.5 on case `16`, with-arm only, 3 runs per level: `xhigh` scored 0.56
  at $0.089/run, `low` scored 0.56 at $0.076/run (one 10-turn outlier). The
  skill fired 6/6 runs, and every miss was in the rubrics. Sonnet 5.5 scores 1.00
  on this case even without the plugin, so haiku is still below the capability
  floor and effort does not lift it. No full haiku run was made.
- Sonnet 5 on the same suite and plugin: with 0.84 / without 0.73 / Δ +0.11,
  against Sonnet 5.5's 0.92 / 0.83 / +0.09.
- Case `04` exposed a CI-triage playbook gap (gate-job excerpts with no
  assertion). After a playbook fix, `04` went from −0.33 to +0.25 (`runs: 6`).
  Case `24` was added: a playbook-only stack rule, Δ +0.50. Its first rubric
  failed correct no-shell step lists and was clarified.
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
(see "Grounding in real traffic" in [CASES.md](CASES.md)). On both the baseline scores **0.00** and the plugin takes it to ~1.0.

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
required the plan to _"end by"_ iterating, which is right for `TRIAGE` but wrong
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
