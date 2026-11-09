# Next steps

Open work for the eval suite, most recent findings first. Current results are in
[EVALS.md](EVALS.md).

## From the 2026-11-09 run

Done on `evals/raise-weak-cases`: `57`'s plan wording, the tier retag, a
plan-only note on every plan-case LLM grader, and CLI and skill wording for
ESCALATE stops, denied mutations, held drafts and runs with no target. The weak
cases were rerun at `runs: 6`; see [EVALS.md](EVALS.md#follow-up-weak-cases-at-runs-6-2026-11-09).

1. **Run a full sweep** with the discriminating tier at `runs: 6` and refresh
   EVALS.md and the README. Graders changed for every plan case, so the
   2026-11-09 full-run numbers are no longer comparable.
2. **Done: `49` is a guard.** The ESCALATE step now says not to rerun or
   requeue, so both arms score 1.00 at `runs: 6`.
3. **`02`, `07`, `11`** lost their without-arm zeros or gained without-arm
   points after the plan-only note. Confirm on the sweep before retagging.
4. **Done: `40` is a guard.** It scored 1.00 without the plugin at `runs: 6`.
   Its one with-arm failure named `--until-terminal` for the next wake-up,
   which the corrected grader accepts.

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
