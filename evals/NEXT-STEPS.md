# Next steps

Open work for the eval suite, most recent findings first. Current results are in
[EVALS.md](EVALS.md).

## From the 2026-11-09 sweep (after the tier retag)

1. **`43`: agents without a scheduler tell the user to set the wake-up.** At
   `runs: 6` it scored 0.89 with and 0.50 without in two reruns. The two
   failing plans each read the Event loop playbook, then still wrote "If your
   host has a one-shot scheduler, set it" or "you'll need to set that wake-up
   yourself". Giving the playbook an exact no-scheduler sentence and forbidding
   "tell them to schedule or rerun" did not move the score, so it was not
   kept. Next idea: put the no-scheduler sentence in the CLI's own `READY`
   wake-up step, where every caller reads it.
2. **Revisit `11`, `21`, `29`, `36`, `50`, `51` and `56`.** Tagged
   discriminating, with-arm at least 0.94, but the without-arm reached 0.83 to
   1.00 and every interval includes 0. Retag after one more full run if they
   hold.

Done (follow-up reruns at `runs: 6`, 2026-11-09):

- `17` scored 1.00 with and 0.92 without, then 1.00 and 1.00: it stays a guard.
  Its grader no longer claims the output lists only #311 (both layers are
  listed), and it accepts the #311 session's printed `gh stack` commands and a
  #312 session gated on a later rerun.
- `06` scored 1.00 with and 0.80 without, and `54` 1.00 and 1.00. Their
  sweep-2 misses did not repeat. A re-judge found no difference between the
  passing and failing `06` plans.
- `43`'s grader now follows the printed step: end the turn and rerun at the
  wake-up or on a PR event. A one-sentence "no scheduler" note passes; telling
  the user to set the wake-up or rerun fails.

Done: `27`'s plans fell back to `gh stack` for a PR outside a native stack;
the Branch update playbook now scopes itself to native stacks (#666; rerun
1.00 with). Case `59` exposed released-blocker output that still printed fix
and push steps; the CLI now prints only the branch update (#665; rerun 1.00
with).

## From the 2026-11-09 sweep (after the grader fixes)

1. **Revisit `06`, `07`, `29`, `35` and `50`** at the next full run. They
   stay discriminating with a with-arm of at least 0.9 and an interval
   including 0, because their without-arm is below 0.9 (0.58 to 0.89) and more
   runs may separate them.

Done: retagged tiers. `01`, `08`, `12`, `22`, `38`, `48` and `55` moved to
guard (without-arm 0.92 to 1.00); `54` moved to discriminating (with-arm
0.89). `39` stays guard: its rerun scored 0.94 in both arms. `28`'s bare-number
rerun: the CLI now names a qualified PR's URL in the `[TRIAGE]` rerun step
(#662).

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
2. **Done: fixtures and cases for #463 and #471.** Fixtures `175` (open
   blocker, `WAIT`) and `176` (released blocker, update the branch) back
   cases `58` and `59`; `60` replays fixture `170` (classification
   auto-resolve). The fixture harness gained an optional `checkBlockers` field.
3. **Done: every case ran at `runs: 6`** (2026-10-12). 13 cases have
   intervals that exclude 0.
4. **Done: the `[Required]` approval-gate case ran.** `43` scored 1.00 with
   and 0.94 without, so it is a guard.
5. **Add a bad-workflow-YAML fixture**, if the CLI surfaces that state at all.
   If it doesn't, that's a CLI gap and no eval can close it.
6. **Watch the over-trigger rate, not just Δ.** A widened skill `description`
   can start activating on unrelated GitHub questions while every score looks
   healthy.
7. **Done in `analyze.mjs`:** the case fingerprint is split into scored and
   display-only parts, and the plugin guard compares a recorded source hash.
   Still open: the runner does not record that hash, so today the guard only
   prints this checkout's hash.
8. **Surface the failing jobs' log tails when the failing job is a gate.**
   The `04` fix has the agent run `gh run view --log-failed`. Per "Surface
   data, don't classify it", the CLI should print that evidence itself. This
   #491 landed this: `## Failing checks` now lists sibling failed jobs with
   log tails. On the 2026-10-12 run `04` scored 1.00 with and 0.92 without,
   so the printed tails carry most of it now.
9. **Lift the weak with-arm gotchas first**, since they carry ×3 weight:
   `06` 0.47 (stale bot review dismissal), `48` 0.67 (fails
   `iterates-immediately`), `38` 0.72 (retries the denied reply), `49` 0.75
   (reruns or requeues), and `27`/`28` (merged stack parent, 0.79/0.78). Then
   the loop rules `11` 0.50 and `02` 0.67. Read their transcripts before
   changing the skill.
10. **More playbook-only stack cases.** `24` shows the pattern: stack rules
    printed in the output sit at ceiling, and rules found only in a playbook
    discriminate. `51` covers a native-stack merge-queue ejection (fixture
    `120`); fixture `98` is covered by `61` (a merge-queued stack stays
    non-terminal).

Dropped:

- The haiku trigger rate: haiku is out of scope for these evals.
- Running evals in CI: it would need an Anthropic token in CI.
- Measuring call counts and tokens with a Bash-granting suite: the runner
  refuses to grant Bash while `~/.docker` holds Docker Desktop's symlinks. The
  offline token bench (`evals/tokens/`) covers cost instead.
