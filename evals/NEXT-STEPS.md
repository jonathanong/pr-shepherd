# Next steps

Open work for the eval suite, most recent findings first. Current results are in
[EVALS.md](EVALS.md).

## From the 2026-11-09 run

1. **Rerun `57` after #657.** Its grader asked for executed actions, so the
   judge failed every plan-only response in both arms. With the plan wording,
   all six recorded plans pass; expect about 1.00 in both arms (a guard).
2. **Check the with-arm drops since 2026-10-12** before changing the skill.
   They are at `runs: 3`, where the noise floor is about ±0.44, so the samples
   are small. The drops are large (`07` and `01` exceed that range), but their
   size alone is not evidence of a significant regression:
   `07` 0.89 → 0.33, `01` 1.00 → 0.50 (fails `iterates-immediately`),
   `06` 0.47 → 0.20, `49` 0.75 → 0.42. Rerun them at `runs: 6` and read the
   transcripts.
3. **Lift the weak with-arm cases**, GitHub gotchas first (×3 weight): `06`,
   `07`, `49`, `48` (0.50, fails `iterates-immediately`), `38` (0.61, retries
   the denied reply), then `55`, `11`, `40` (0.67; `40` scores 1.00 without
   the plugin, failing `ends-the-turn-without-waiting`).
4. **Retag tiers** as `--summary` suggests. Promote to discriminating: `04`,
   `22`, `33`, `50`, `51` (interval excludes 0), and consider `08`, `12`,
   `29`, `40`, `43` (with-arm below 0.9). Demote to guard: `21`, `35`, `53`,
   `54`.
5. **Run the discriminating tier at `runs: 6`.** Most cases ran at the
   committed `runs: 3`; only `38`, `39` and `43`–`56` ran at 6.

## Earlier list (2026-10-12)

1. **Done: stack Branch-update cases.** Fixtures `129` and `120` emit the
   `Playbook: "Branch update"` route (`gh stack checkout` / `rebase` / `push`);
   `28` and `51` grade it.
2. **Add fixtures for #463 (check blocked by another PR) and #471
   (classification auto-resolve)**, then cases for them.
3. **Fix the haiku trigger rate (53%).** One line in the skill `description`
   moved a sibling suite from 44% to 94%.
4. **Done: every case ran at `runs: 6`** (2026-10-12). 13 cases have
   intervals that exclude 0.
5. **Unblock the call-count and token measurement.** Flatten `~/.docker`, then
   build a suite that grants Bash to both arms. Watch for the inverted failure:
   with no working binary, the with-arm tries the CLI, fails, and Δ goes negative.
6. **Done: the `[Required]` approval-gate case ran.** `43` scored 1.00 with
   and 0.94 without, so it is a guard.
7. **Add a bad-workflow-YAML fixture**, if the CLI surfaces that state at all.
   If it doesn't, that's a CLI gap and no eval can close it.
8. **Watch the over-trigger rate, not just Δ.** A widened skill `description`
   can start activating on unrelated GitHub questions while every score looks
   healthy.
9. **Done in `analyze.mjs`:** the case fingerprint is split into scored and
   display-only parts, and the plugin guard compares a recorded source hash.
   Still open: the runner does not record that hash, so today the guard only
   prints this checkout's hash.
10. **Wire the sonnet tier into CI** for PRs touching
    `plugins/pr-shepherd/skills/**`.
11. **Surface the failing jobs' log tails when the failing job is a gate.**
    The `04` fix has the agent run `gh run view --log-failed`. Per "Surface
    data, don't classify it", the CLI should print that evidence itself. This
    #491 landed this: `## Failing checks` now lists sibling failed jobs with
    log tails. On the 2026-10-12 run `04` scored 1.00 with and 0.92 without,
    so the printed tails carry most of it now.
12. **Lift the weak with-arm gotchas first**, since they carry ×3 weight:
    `06` 0.47 (stale bot review dismissal), `48` 0.67 (fails
    `iterates-immediately`), `38` 0.72 (retries the denied reply), `49` 0.75
    (reruns or requeues), and `27`/`28` (merged stack parent, 0.79/0.78). Then
    the loop rules `11` 0.50 and `02` 0.67. Read their transcripts before
    changing the skill.
13. **More playbook-only stack cases.** `24` shows the pattern: stack rules
    printed in the output sit at ceiling, and rules found only in a playbook
    discriminate. `51` covers a native-stack merge-queue ejection (fixture
    `120`); fixture `98` is still uncovered.
