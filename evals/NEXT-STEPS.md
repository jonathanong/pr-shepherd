# Next steps

Open work for the eval suite, most recent findings first. Current results are in
[EVALS.md](EVALS.md).

## From the 2026-11-09 sweep (after the grader fixes)

1. **Retag tiers** as `--summary` suggests. Twelve discriminating cases had an
   interval including 0 and a with-arm of at least 0.9: `01`, `06`, `07`, `08`,
   `12`, `22`, `29`, `35`, `38`, `48`, `50`, `55`. Demote those that also sit
   at ceiling without the plugin. Promote `54` (with-arm below 0.9). Optional:
   sharded runs make the extra runs cheap.
2. **`28` reruns with a bare PR number** in two of six plans instead of the URL
   the user gave. Consider whether the CLI's "Rerun Shepherd now." step should
   print the exact rerun command.

Done: `39` was variance (0.94 in both arms on rerun); `27`'s grader no longer
asks to re-check what Shepherd matched; `28` no longer switches to `stack`;
`21` and `56` graders accept correct observations.

## Earlier: from the first 2026-11-09 run

Done: `57`'s plan wording, the tier retag, a plan-only note on every plan-case
LLM grader, CLI and skill wording for ESCALATE stops, denied mutations, held
drafts and runs with no target, `40` and `49` moved to guard, and the full sweep
above.

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
