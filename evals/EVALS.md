# Eval results

Does an agent act correctly on pr-shepherd's output, and would it without the
plugin? Each case runs twice, with the skill and without it; the headline is
**Δ = with − without**. Only a Δ whose 95% bootstrap interval excludes 0 is a
result.

- [RUNNING.md](RUNNING.md): commands, reading a result, tiers, weighting,
  environment constraints.
- [CASES.md](CASES.md): what each case tests and where it came from.
- [NEXT-STEPS.md](NEXT-STEPS.md): open work.
- [HISTORY.md](HISTORY.md): past runs and the calibration log.

## Latest results (2026-11-09)

Sonnet 5.5, `CLAUDE_CODE_EFFORT_LEVEL=low`, opus judge, `main` at `9c58795b`,
all 57 cases at their committed run counts (`runs: 6` for `38`, `39` and
`43`–`56`; `runs: 3` otherwise). 438 runs, $34.08, about 2.5 hours. No run
errors.

- **Weighted mean Δ +0.15** [+0.13, +0.18] (github ×3, safety ×2, loop ×1).
  - GitHub gotchas: +0.17 [+0.13, +0.20] over 39 cases.
  - Safety: +0.03 [−0.03, +0.08] over 4 cases.
  - Loop rules: +0.14 [+0.07, +0.20] over 14 cases.
- **No plugin regression** has an interval below 0.
- **Skill fired** 216/216 where it should, 0/3 on the unrelated question.
- **At ceiling in both arms:** 18 of 57.

Cases where the plugin changes the outcome (interval excludes 0):

| Case | What the plugin gets right                                     | with → without | Δ     |
| ---- | -------------------------------------------------------------- | -------------- | ----- |
| `31` | "Make a PR": push and create it without asking                 | 1.00 → 0.00    | +1.00 |
| `56` | Queued PR with conflicts: dequeue before pushing, or wait      | 0.83 → 0.00    | +0.83 |
| `02` | `MARK_READY` is non-terminal                                   | 0.67 → 0.00    | +0.67 |
| `22` | Clean draft stack with auto-ready disabled: stop               | 0.67 → 0.00    | +0.67 |
| `37` | "Shepherd my PR": run with no target                           | 0.67 → 0.00    | +0.67 |
| `47` | Stack layer reads "3 passing" but its latest run was cancelled | 1.00 → 0.39    | +0.61 |
| `04` | A real failure is not blindly rerun                            | 1.00 → 0.50    | +0.50 |
| `05` | A cancelled run must be rerun                                  | 1.00 → 0.50    | +0.50 |
| `33` | Run `suggest` for a `[suggestion]` thread                      | 0.89 → 0.44    | +0.44 |
| `51` | Stack queue removal follows the printed route                  | 1.00 → 0.72    | +0.28 |
| `27` | Retarget a merged parent's base first                          | 0.83 → 0.58    | +0.25 |
| `36` | REST cannot run queue recovery; no requeue                     | 1.00 → 0.75    | +0.25 |
| `50` | Wait for GitHub to retarget the bottom stack layer             | 1.00 → 0.75    | +0.25 |

Weak with the plugin (with-arm below 0.7) in that run: `06` 0.20, `07` 0.33,
`49` 0.42, `01` 0.50, `48` 0.50, `38` 0.61, and `02`, `11`, `22`, `37`, `40`,
`55` at 0.67. `57` scored 0.50 in both arms because its grader graded executed
actions instead of the plan.

### Follow-up: weak cases at `runs: 6` (2026-11-09)

The CLI, skill and grader fixes on `evals/raise-weak-cases` were tested by
rerunning the weak cases at `runs: 6`: ESCALATE and stop-step wording, denial
handling, "no PR: pass none", the plan-only grader note, and the
`reruns-on-wake` grader for `WAIT` ticks. These are targeted runs, not a full
sweep.

| Case | before (with → without) | after (with → without) |
| ---- | ----------------------- | ---------------------- |
| `01` | 0.50 → 0.50             | 1.00 → 1.00            |
| `02` | 1.00 → 0.00             | 1.00 → 0.67            |
| `06` | 0.47 → 0.40             | 0.87 → 0.80            |
| `07` | 0.33 → 0.33             | 1.00 → 0.67            |
| `11` | 0.50 → 1.00             | 1.00 → 0.67            |
| `22` | 0.42 → 0.08             | 0.83 → 1.00            |
| `37` | 0.83 → 0.00             | 1.00 → 0.00            |
| `38` | 0.61 → 0.33             | 1.00 → 1.00            |
| `48` | 0.50 → 0.50             | 1.00 → 1.00            |
| `49` | 0.42 → 0.50             | 0.83 → 0.92            |
| `55` | 0.72 → 0.67             | 1.00 → 1.00            |
| `57` | 0.50 → 0.50             | 1.00 → 1.00            |

"Before" is `main` at `runs: 6` where it was rerun (`eval-weak-base`), and the
full run otherwise. `22`'s two failed stop checks re-judge PASS under the
corrected grader, which accepts a closing line saying readying is the human's
decision; one more `22` run failed only because the skill didn't fire.
See [NEXT-STEPS.md](NEXT-STEPS.md).

<details>
<summary>All cases</summary>

| Case | runs | with | without | Δ     | Case | runs | with | without | Δ     |
| ---- | ---- | ---- | ------- | ----- | ---- | ---- | ---- | ------- | ----- |
| `01` | 3    | 0.50 | 0.50    | 0.00  | `30` | 3    | 0.89 | 0.67    | +0.22 |
| `02` | 3    | 0.67 | 0.00    | +0.67 | `31` | 3    | 1.00 | 0.00    | +1.00 |
| `03` | 3    | 0.90 | 1.00    | −0.10 | `32` | 3    | 0.92 | 0.92    | 0.00  |
| `04` | 3    | 1.00 | 0.50    | +0.50 | `33` | 3    | 0.89 | 0.44    | +0.44 |
| `05` | 3    | 1.00 | 0.50    | +0.50 | `34` | 3    | 1.00 | 0.89    | +0.11 |
| `06` | 3    | 0.20 | 0.47    | −0.27 | `35` | 3    | 1.00 | 0.50    | +0.50 |
| `07` | 3    | 0.33 | 0.33    | 0.00  | `36` | 3    | 1.00 | 0.75    | +0.25 |
| `08` | 3    | 0.87 | 1.00    | −0.13 | `37` | 3    | 0.67 | 0.00    | +0.67 |
| `09` | 3    | 1.00 | 0.83    | +0.17 | `38` | 6    | 0.61 | 0.39    | +0.22 |
| `10` | 3    | 1.00 | 0.33    | +0.67 | `39` | 6    | 1.00 | 1.00    | 0.00  |
| `11` | 3    | 0.67 | 1.00    | −0.33 | `40` | 3    | 0.67 | 1.00    | −0.33 |
| `12` | 3    | 0.83 | 1.00    | −0.17 | `41` | 3    | 1.00 | 1.00    | 0.00  |
| `13` | 3    | 1.00 | 1.00    | 0.00  | `42` | 3    | 1.00 | 1.00    | 0.00  |
| `14` | 3    | 1.00 | 1.00    | 0.00  | `43` | 6    | 0.89 | 0.78    | +0.11 |
| `15` | 3    | 1.00 | 1.00    | 0.00  | `44` | 6    | 1.00 | 1.00    | 0.00  |
| `16` | 3    | 1.00 | 1.00    | 0.00  | `45` | 6    | 1.00 | 1.00    | 0.00  |
| `17` | 3    | 1.00 | 1.00    | 0.00  | `46` | 6    | 1.00 | 1.00    | 0.00  |
| `18` | 3    | 1.00 | 1.00    | 0.00  | `47` | 6    | 1.00 | 0.39    | +0.61 |
| `19` | 3    | 1.00 | 1.00    | 0.00  | `48` | 6    | 0.50 | 0.50    | 0.00  |
| `20` | 3    | 1.00 | 1.00    | 0.00  | `49` | 6    | 0.42 | 0.50    | −0.08 |
| `21` | 3    | 1.00 | 0.33    | +0.67 | `50` | 6    | 1.00 | 0.75    | +0.25 |
| `22` | 3    | 0.67 | 0.00    | +0.67 | `51` | 6    | 1.00 | 0.72    | +0.28 |
| `23` | 3    | 1.00 | 1.00    | 0.00  | `52` | 6    | 1.00 | 1.00    | 0.00  |
| `24` | 3    | 1.00 | 1.00    | 0.00  | `53` | 6    | 1.00 | 0.89    | +0.11 |
| `25` | 3    | 1.00 | 1.00    | 0.00  | `54` | 6    | 0.94 | 0.94    | 0.00  |
| `26` | 3    | 1.00 | 0.78    | +0.22 | `55` | 6    | 0.67 | 0.67    | 0.00  |
| `27` | 3    | 0.83 | 0.58    | +0.25 | `56` | 6    | 0.83 | 0.00    | +0.83 |
| `28` | 3    | 0.78 | 0.67    | +0.11 | `57` | 3    | 0.50 | 0.50    | 0.00  |
| `29` | 3    | 0.89 | 1.00    | −0.11 |      |      |      |         |       |

At `runs: 3` the noise floor is about ±0.44, so a per-case Δ whose interval
includes 0 is not a result. `10`, `21` and `35` read +0.50 or more but their intervals include 0.

</details>
