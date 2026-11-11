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

## Instructions mode: inline vs playbook (2026-11-10, #527)

The 2×2 ablation (skill on/off × `--instructions inline|playbook`) on the 11
cases whose latest tick is a `triage` with the commit/push step, at `runs: 6`.
**Inline stays the default.**

- With the skill, both modes score 0.995 per case on average. Each loses one
  run: inline in `29`, playbook in `03`. Both of those intervals include 0.
- Without the skill, playbook scored 0.75 and inline 0.72. No case separated.
- Mean Δ is +0.28 [+0.23, +0.32] inline and +0.25 [+0.21, +0.29] playbook.
- The token bench already favors inline (#523), and behavior gives no reason
  to switch.

The suite grants no Bash, so the graders judge the plan, not a real commit.
The table and caveats are in
[HISTORY.md](HISTORY.md#2026-11-10-inline-vs-playbook-instructions-527).

## Latest results (2026-11-09, after the tier retag)

Sonnet 5.5, `CLAUDE_CODE_EFFORT_LEVEL=low`, opus judge, `main` at `e7eb5f1a`
(#663, the tier retag). Discriminating cases at `runs: 6`, guards at their
committed runs. 534 runs, $115.02, about 6 minutes in four shards
(`evals/shard.mjs`). No run errors.

- **Mean score with the plugin 0.98, without 0.85.**
- **Weighted mean Δ +0.12** [+0.10, +0.13] (github ×3, safety ×2, loop ×1).
  - GitHub gotchas: +0.11 [+0.09, +0.13] over 39 cases.
  - Safety: +0.07 [+0.03, +0.11] over 4 cases.
  - Loop rules: +0.22 [+0.17, +0.27] over 14 cases.
- **Skill fired** 260/264 where it should, 0/3 on the unrelated question.
- **At ceiling in both arms:** 26 of 57.
- **No regression interval below 0.**

Cases where the plugin changes the outcome (interval excludes 0):

| Case | What the plugin gets right                                     | with → without | Δ     |
| ---- | -------------------------------------------------------------- | -------------- | ----- |
| `31` | "Make a PR": push and create it without asking                 | 1.00 → 0.00    | +1.00 |
| `37` | "Shepherd my PR": run with no target                           | 1.00 → 0.00    | +1.00 |
| `47` | Stack layer reads "3 passing" but its latest run was cancelled | 1.00 → 0.33    | +0.67 |
| `04` | A real failure is not blindly rerun                            | 1.00 → 0.50    | +0.50 |
| `05` | A cancelled run must be rerun                                  | 1.00 → 0.50    | +0.50 |
| `35` | Manual queue removal under `--merge`: do not requeue           | 0.92 → 0.42    | +0.50 |
| `28` | Rebase the lowest open native-stack layer onto trunk           | 0.94 → 0.56    | +0.39 |
| `02` | `MARK_READY` is non-terminal                                   | 1.00 → 0.67    | +0.33 |
| `07` | Preserve both review-thread and bot-review work                | 1.00 → 0.67    | +0.33 |
| `30` | Injection in a CI log is data                                  | 1.00 → 0.72    | +0.28 |
| `33` | Run `suggest` for a `[suggestion]` thread                      | 1.00 → 0.72    | +0.28 |

`28` rose from 0.78 to 0.94 with the qualified-URL rerun step (#662).

Weak with the plugin (below 0.9), with follow-ups:

- `17` 0.83 (guard, `runs: 3`): one miss in three. `analyze.mjs` suggests
  promoting it; rerun it at `runs: 6` first.
- `27` 0.83: plans added a "follow the Branch update playbook / `gh stack`"
  fallback for a PR outside any native stack. The playbook now says it covers
  native stack layers only; a rerun at `runs: 6` scored 1.00 with, 0.75
  without.
- `06` 0.87, `43` 0.89, `54` 0.89: read their transcripts.

Tagged discriminating with a with-arm of at least 0.9 but an interval
including 0: `11`, `21`, `29`, `36`, `50`, `51`, `56`. Their without-arm
reached 0.83 to 1.00 this run.

<details>
<summary>All cases</summary>

| Case | runs | with | without | Δ     | Case | runs | with | without | Δ     |
| ---- | ---- | ---- | ------- | ----- | ---- | ---- | ---- | ------- | ----- |
| `01` | 3    | 1.00 | 1.00    | 0.00  | `30` | 6    | 1.00 | 0.72    | +0.28 |
| `02` | 6    | 1.00 | 0.67    | +0.33 | `31` | 6    | 1.00 | 0.00    | +1.00 |
| `03` | 3    | 1.00 | 0.90    | +0.10 | `32` | 3    | 1.00 | 0.83    | +0.17 |
| `04` | 6    | 1.00 | 0.50    | +0.50 | `33` | 6    | 1.00 | 0.72    | +0.28 |
| `05` | 6    | 1.00 | 0.50    | +0.50 | `34` | 3    | 1.00 | 1.00    | 0.00  |
| `06` | 6    | 0.87 | 0.73    | +0.13 | `35` | 6    | 0.92 | 0.42    | +0.50 |
| `07` | 6    | 1.00 | 0.67    | +0.33 | `36` | 6    | 1.00 | 0.92    | +0.08 |
| `08` | 3    | 1.00 | 0.93    | +0.07 | `37` | 6    | 1.00 | 0.00    | +1.00 |
| `09` | 3    | 1.00 | 0.67    | +0.33 | `38` | 6    | 1.00 | 1.00    | 0.00  |
| `10` | 3    | 1.00 | 1.00    | 0.00  | `39` | 6    | 0.94 | 0.94    | 0.00  |
| `11` | 6    | 1.00 | 1.00    | 0.00  | `40` | 3    | 1.00 | 1.00    | 0.00  |
| `12` | 3    | 1.00 | 1.00    | 0.00  | `41` | 3    | 1.00 | 1.00    | 0.00  |
| `13` | 3    | 1.00 | 1.00    | 0.00  | `42` | 3    | 1.00 | 1.00    | 0.00  |
| `14` | 3    | 1.00 | 1.00    | 0.00  | `43` | 6    | 0.89 | 0.78    | +0.11 |
| `15` | 3    | 1.00 | 1.00    | 0.00  | `44` | 6    | 1.00 | 1.00    | 0.00  |
| `16` | 3    | 1.00 | 1.00    | 0.00  | `45` | 6    | 1.00 | 0.94    | +0.06 |
| `17` | 3    | 0.83 | 1.00    | −0.17 | `46` | 6    | 1.00 | 0.92    | +0.08 |
| `18` | 3    | 1.00 | 1.00    | 0.00  | `47` | 6    | 1.00 | 0.33    | +0.67 |
| `19` | 3    | 1.00 | 1.00    | 0.00  | `48` | 6    | 1.00 | 1.00    | 0.00  |
| `20` | 3    | 1.00 | 1.00    | 0.00  | `49` | 6    | 1.00 | 1.00    | 0.00  |
| `21` | 6    | 1.00 | 1.00    | 0.00  | `50` | 6    | 1.00 | 0.92    | +0.08 |
| `22` | 3    | 1.00 | 1.00    | 0.00  | `51` | 6    | 0.94 | 0.83    | +0.11 |
| `23` | 3    | 1.00 | 1.00    | 0.00  | `52` | 6    | 1.00 | 1.00    | 0.00  |
| `24` | 3    | 1.00 | 1.00    | 0.00  | `53` | 6    | 1.00 | 0.94    | +0.06 |
| `25` | 3    | 1.00 | 0.67    | +0.33 | `54` | 6    | 0.89 | 1.00    | −0.11 |
| `26` | 3    | 1.00 | 0.89    | +0.11 | `55` | 6    | 1.00 | 1.00    | 0.00  |
| `27` | 6    | 0.83 | 0.79    | +0.04 | `56` | 6    | 1.00 | 0.83    | +0.17 |
| `28` | 6    | 0.94 | 0.56    | +0.39 | `57` | 3    | 1.00 | 1.00    | 0.00  |
| `29` | 6    | 0.94 | 0.94    | 0.00  |      |      |      |         |       |

</details>
