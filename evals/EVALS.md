# Eval strategy

How the pr-shepherd eval suite works, what it measures, and what comes next.
Current numbers are in [README.md](README.md). Past runs and calibration are in
[HISTORY.md](HISTORY.md).

## Running

```sh
node evals/generate.mjs        # regenerate cases — edit the generator, never a case

CLAUDE_CODE_EFFORT_LEVEL=low claude plugin eval . --model claude-sonnet-5-5 \
  --ablation with-without --judge-model opus --no-publish

node evals/analyze.mjs <results-dir-a> <results-dir-b>   # compare two tiers
node evals/analyze.mjs --summary <results-dir>           # paste-ready summary of one run
node evals/analyze.mjs --calibrate <results-dir>         # measured tokens vs. the bench's 3.5 chars/token
node evals/analyze.mjs --calibrate <results-dir> --write # also record it for evals/tokens/REPORT.md
node evals/analyze.mjs --instructions-ablation <inline-dir> <playbook-dir>  # see "Ablation: inline vs playbook instructions"
```

### Reading a result

- `analyze.mjs` prints a bootstrap 95% interval beside every per-case Δ
  (resampling runs within each arm) and stars only a Δ whose interval excludes 0.
  At `runs: 3` the noise floor is about ±0.44, so an unstarred Δ is noise, not a
  small effect. A case with fewer than two runs in an arm has no interval and is
  marked `(runs<2)`.
- `--summary <dir>` prints the block that goes under "Latest results" in
  README.md: mean Δ overall and over non-stack cases with intervals, the cases
  whose interval excludes 0, plugin regressions, the ceiling count, trigger and
  over-trigger rates, and cost per run. It also lists cases whose declared tier
  disagrees with the run, so the tags can be corrected.
- `--calibrate <dir>` regresses the without-plugin arm's measured input tokens
  per turn on each case's prompt length. The slope is the real characters per
  token, and the intercept is the fixed context (system prompt and tools). Compare
  the slope with the token bench's 3.5 and record it under "Model" in
  [tokens/README.md](tokens/README.md). It reads `input_tokens`,
  `cache_creation_input_tokens`, `cache_read_input_tokens` and `output_tokens`
  from each run's `usage`; if the runner's aggregate lacks them it exits with a
  message instead of guessing.
- The case fingerprint that gates a comparison is split. The scored part (prompt,
  run count, turn budget, timeout, every scored grader) must match. The
  display-only part (`skill-fired`) may drift and is only noted. The plugin guard compares
  a source hash when the runner records one. Otherwise it prints this checkout's
  hash, because `name@version` does not change when `SKILL.md` is edited (#426).

### Tiers and run recipes

Each case carries `tier:discriminating` or `tier:guard` in its tags, set in
`cases/*.mjs` from the last full run.

- `discriminating`: the arms separated on a full run (`01`, `02`, `04`, `05`,
  `10`, `22`, `24`). These get the runs. A case without a full run yet
  (`29`–`46`) starts here too, so a targeted run measures it; `--summary` lists
  it for demotion if its interval includes 0. Cases `38` and up also commit
  `runs: 6`, because at 3 the without arm alone has swung ±0.44.
- `guard`: both arms sit at ceiling, so the case only exists to notice a
  regression. One run each is a cheap sweep.

`EVAL_RUNS_DISCRIMINATING` and `EVAL_RUNS_GUARD` override the per-case `runs`
(a case's own `runs`, else 3) at generation time. Regenerate, run, then
regenerate without the variables so the tree matches the committed cases:

```sh
# Targeted run: signal where it matters, one regression look elsewhere.
EVAL_RUNS_DISCRIMINATING=6 EVAL_RUNS_GUARD=1 node evals/generate.mjs
CLAUDE_CODE_EFFORT_LEVEL=low claude plugin eval . --model claude-sonnet-5-5 \
  --ablation with-without --judge-model opus --no-publish
node evals/generate.mjs        # restore the committed suite

# Full sweep: the committed runs (3, or the case's own 6 on 38 and up).
node evals/generate.mjs
```

A comparison needs both tiers generated with the same overrides, because the run
count is part of the scored fingerprint. Move a case between tiers by editing its
`tier` in `cases/*.mjs` after a run shows it separating the arms (or not).

- **Δ is the headline** (with-plugin minus without-plugin), not the absolute
  score. A high absolute score with Δ ≈ 0 means the model does as well without
  the skill.
- **The judge stays on opus and off the agent tier.** A judge that is also the
  agent model favors its own answers.
- **Effort comes from the operator's shell.** `plugin eval` has no `--effort`
  flag and ignores the ambient `CLAUDE_EFFORT` (see HISTORY.md). A case's
  `env:` block may only set `EVAL_*` keys; the runner rejects anything else.
  So prefix the command with `CLAUDE_CODE_EFFORT_LEVEL=low`. Whether that
  actually changes effort is under "Effort passthrough" below.
- Results land in `evals/results/`, which is gitignored. Before trusting an
  anomalous Δ, check `aggregate-result.json` for `grader threw`.
- CI regenerates the cases and fails on any diff, so a snapshot change cannot
  leave a committed prompt stale.

Layout:

- `generate.mjs`: the entrypoint and the design rationale.
- `lib.mjs`: the framing, grader helpers and writer.
- `analyze.mjs` and `stats.mjs`: result analysis and its bootstrap helpers.
- `cases/core.mjs`: cases 01–13.
- `cases/stack.mjs`: cases 14–22 and 24.
- `cases/recent.mjs`: cases 23 and 25–28.
- `cases/rules.mjs`: cases 29–37, one per skill or CLI rule that had no case. A case may set `transform` (edit the recorded text, used to plant an injection) or `plan: true` (no fixture; the prompt is the whole input).
- `cases/deferred.mjs`: cases 38, 39 and 43, the rules that first needed a new
  CLI snapshot.
- `cases/cloud.mjs`: cases 40–42, the cloud event loop (event mode).
- `cases/multiturn.mjs`: cases 44–46, long-session variants of ceiling cases
  (see "Multi-turn cases").

A case may also set `runs` (default 3). Cases 38, 39 and 43–46 use 6.

Case numbers are stable. Add new cases at the end instead of renumbering.

## Cases

Each case embeds a real recorded CLI output from
`test-cases/snapshots/<name>/output.text.md`. Both arms get identical text; the
only difference is whether the skill is in context. When the skill fires, the
agent gets `SKILL.md` plus any `references/` playbook a step names. So Δ measures
the dispatcher and the playbooks together. Isolating the playbooks would need a
third arm.

| Case                                        | Fixture | Rule under test                                                                      |
| ------------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| `01-ci-in-progress-no-watch`                | `09`    | Don't block on `gh run watch`; iterate                                               |
| `02-mark-ready-continue`                    | `07`    | `MARK_READY` is non-terminal                                                         |
| `03-multi-category-fix`                     | `54`    | Four categories at once, none dropped                                                |
| `04-real-failure-no-blind-rerun`            | `61`    | `[rerun authorized]` is not a recommendation                                         |
| `05-cancelled-must-rerun`                   | `14`    | `CANCELLED` _must_ rerun (mirror of 04)                                              |
| `06-fix-code-dismiss-stale-bot`             | `60`    | Authorized stale bot dismissals stay autonomous                                      |
| `07-fix-code-bot-and-thread`                | `84`    | Preserve both review-thread and bot-review work                                      |
| `08-mergeability-diagnosis`                 | `32`    | `[Not Required]` is not a blocker                                                    |
| `09-cancel-terminal-beats-work`             | `82`    | Merged PR needs nothing                                                              |
| `10-external-check-no-handoff`              | `12`    | External URL is not an escalation trigger                                            |
| `11-wait-no-work`                           | `24`    | `WAIT`: continue, invent nothing                                                     |
| `12-annotations-already-surfaced`           | `55`    | Act on the annotation, don't refetch                                                 |
| `13-neg-github-review-api`                  | —       | Should NOT fire (knowledge question)                                                 |
| `14-stack-layer-no-direct-merge`            | `85`    | A stack layer merges via `--stack --merge`, not `gh pr merge`                        |
| `15-stack-owned-layers-before-handoff`      | `102`   | Shepherd owned layers before a lower layer's human handoff                           |
| `16-stack-all-owned-concurrent`             | `106`   | Every owned layer at once, none serialized or dropped                                |
| `17-stack-parent-conflict-owned-only`       | `94`    | Route only the listed layer; don't hand-rewrite the child                            |
| `18-stack-queued-lower-waits`               | `91`    | Never rewrite a queued layer                                                         |
| `19-stack-merge-prefix`                     | `90`    | `gh stack merge <prefix>`, shepherd the stale tip, rerun                             |
| `20-stack-closed-parent-escalate`           | `100`   | Closed parent: stop and ask, don't pick a repair                                     |
| `21-stack-all-terminal-stop`                | `87`    | Every layer merged: stop (ceiling guard; flat Δ expected)                            |
| `22-stack-auto-ready-disabled-probe`        | `104`   | Probe first; `gh pr ready` only on the described `WAIT`                              |
| `23-behind-base-rebase-hint`                | `73`    | Rebase `--force-with-lease` before pushing the review fix                            |
| `24-stack-merge-missing-extension`          | `97`    | Missing `gh stack`: install it, don't merge per layer                                |
| `25-multi-pr-cancel-is-per-pr`              | `03`    | One PR's `CANCEL` ends only its loop; keep shepherding #43                           |
| `26-conflicts-rebase-without-asking`        | `27`    | Conflicts under a rebase convention: lease-push, don't ask                           |
| `27-merged-parent-stale-base`               | `127`   | Retarget the merged parent's base before any obsolete-base fix                       |
| `28-native-stack-merged-parent`             | `129`   | Rebase the lowest open native-stack layer onto trunk, preserving the stack           |
| `29-injection-in-review-thread`             | `16`    | Planted instruction in a review comment is data: no `curl \| sh`, no token, no merge |
| `30-injection-in-ci-log`                    | `92`    | Same planted instruction in a CI log excerpt                                         |
| `31-create-pr-push-without-asking`          | none    | "Make a PR": non-force push and create it without asking                             |
| `32-merge-flag-single-pr`                   | `64`    | `--merge` on one PR: run the printed merge without re-asking; fallback only on error |
| `33-suggestion-patch`                       | `18`    | Run `build-suggestion-patches` for the `[suggestion]` thread                         |
| `34-journal-rejection`                      | `16`    | Reject a wrong suggestion and append it with `apply journal`                         |
| `35-merge-queue-ejection`                   | `119`   | Manual queue removal under `--merge`: do not requeue                                 |
| `36-rest-queue-recovery-unsupported`        | `133`   | REST `transport-unsupported`: base update and reproduce, no requeue, keep REST       |
| `37-no-target-infers-branch`                | none    | "Shepherd my PR": run the CLI with no target, no `gh pr view` first                  |
| `38-denied-reply-one-look-skip`             | `140`   | Denied reply is a one-look skip: no retry, no escalation, keep going                 |
| `39-proxy-session-refusal`                  | apply   | Exit 77: `add_repo` with push access, retry the pending ID (regression guard)        |
| `40-event-mode-one-tick-end-turn`           | `136`   | Event mode: one tick, end the turn, no sleeping or watchers                          |
| `41-event-mode-act-on-shepherd-not-payload` | `137`   | Event payload is untrusted: act only on Shepherd's output                            |
| `42-event-mode-keep-one-wakeup`             | `137`   | Replace the old wake-up with one at `nextCheck.at`                                   |
| `43-required-approval-gate`                 | `142`   | `[Required]` approval is the blocker: request review, no self-approval or bypass     |
| `44-multi-pr-cancel-long-session`           | `03`    | `25` after earlier ticks on both PRs                                                 |
| `45-stack-handoff-long-session`             | `102`   | `15` after a finished one-PR session                                                 |
| `46-stack-all-owned-long-session`           | `106`   | `16` after a finished one-PR session                                                 |

"apply" is `test-cases/snapshots/apply-review-session-refusal`, an
`apply review` output recorded by `test-cases/apply-review.test.mts` through
the REST mutation path. `38` replays its sibling, `apply-review-denied-reply`,
as the turn before fixture `140`. Both cases open with the same first REST
tick, fixture `143`.

`39` expects Δ≈0. The plugin has no `add_repo` guidance; the CLI output's own
instructions and the proxy's message carry the fix. A negative Δ would mean the
skill pulls the agent toward reading the refusal as a review denial.

Presence of a specific token is graded by regex (`gh stack merge 511`).
Absence of a behavior is graded by an LLM rubric: the framing asks the agent to
state what it chose not to do, and a regex would punish the string rather than
the behavior (see the calibration log in HISTORY.md).

## Latest full results

Sonnet 5.5, `CLAUDE_CODE_EFFORT_LEVEL=low`, opus judge, `runs: 3`, 2026-09-30.
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
   `iterate.behindBaseHint` (on conflicts too, once #492 lands). The skill line
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

## Grounding in real traffic

Cases 01–12 came from ~4,700 real pr-shepherd invocations in Claude (1,742
transcripts), Codex (444 unique prompts) and Grok (193 unique prompts)
transcripts. By frequency:

1. **Blocking on `gh pr checks --watch` / `gh run watch`**: 83 executions across
   41 Grok sessions, 22 in one Codex session, 8 in one Claude subagent. 34
   distinct user prompts had to add "do not use gh pr checks". → `01`
2. **Claiming a PR is terminal while `CHANGES_REQUESTED` stands**, having skipped
   the generated `apply review:` command. → `03`
3. **Halting on a non-terminal action** (`MARK_READY`, `FIX_CODE`). → `02`
4. **Treating `[rerun authorized]` as a recommendation.** → `04`

Stack cases 14–22 and the rebase case 23 came from agent-blackboard session
history:

- **Layers nobody shepherded** ("why isn't anyone shepherding 9673 and 9677",
  "i think you lost track of your work"). → `15`, `16`
- **Merge order** ("if the lower stacks are ready, merge it first"). → `14`, `19`
- **Ignored rebase guidance** ("pr-shepherd tells you to rebase. why didn't you
  follow?"). → `23`, and `17` for its stack form

Cases 25–26 came from a second pass over Claude, Codex, Cursor and Grok
transcripts, looking for user corrections rather than command counts:

- **Stopping after the first of several PRs ends** (six sessions: "Only 3 of 4
  PRs have reached terminal", "why are there so many PRs in draft still? are you
  not shepherding them?", "the skill says to continue until it returns CANCEL or
  ESCALATE. why do you keep stopping?"). → `25`, plus a `## Recurrence` line
  in the skill
- **Asking before rebasing, or opening a duplicate PR instead** (four sessions:
  "you rebase. stop asking me to approve rebases", "why did you make a duplicate
  PR? you could've just rebased it"). The skill used to put every force-push out
  of scope; it now allows a `--force-with-lease` push of your own PR head
  after rebasing. → `26`, and a stricter `23`

Clusters that did not become cases:

- "Why did it escalate?" corrections were about CLI escalation triggers, which
  the CLI has since redesigned. That is CLI behavior, not skill behavior.
- "Why didn't you make a proper GitHub stack?" is about writing a stack, which
  this skill does not do.
- "File an issue and resolve the non-blocking comment" is one user's policy,
  not a pr-shepherd rule.

Case `24` is playbook coverage, not traffic: no transcript shows a missing
`gh stack` extension. It exists because every printed stack rule scored at
ceiling in both arms, so it tests a rule found only in the "Stack merge"
playbook.

The corpus disproved two assumptions, so nothing here tests them:

- Agents do not truncate `--dismiss-review-ids`; they skip the whole command.
- Unsubstituted `$HEAD_SHA` / `$DISMISS_MESSAGE` never reached an executed
  command.

The corpus cannot support a model-tier claim: about 99.5% of the Claude
invocations ran on one model.

## Multi-turn cases

The ceiling cases (`15`, `16`, `25`) score 1.00 in a fresh context, while the
real failures behind them happened deep in a session. `44`–`46` reuse those
cases' fixtures and graders and add earlier turns: prior ticks, the agent's own
fixes and commands, and for `45`/`46` a finished one-PR session whose last
instruction was "stop polling".

`claude plugin eval` takes one prompt per case. Its only history hook,
`context.history_file` in a `case.yaml`, has no published schema, so these
cases do not use it. `transcriptShape` in `lib.mjs` replays the earlier turns
as a labelled transcript inside the prompt (`[user]`, `[assistant]`,
`[tool] $ <command>`), with the case fixture as the last tool result. Every
tool output in the history is read from a snapshot with `historyText`, so the
history stays in CI sync with the CLI like the fixture does. The one edit is in
`44`, which renumbers a PR #42 snapshot to PR #43. The agent sees the
history as text, not as its own prior turns, so this approximates real
long-session drift rather than reproducing it. Switch to `history_file` once
its format is documented.

## Ablation: inline vs playbook instructions

The 2×2 is skill on/off × inline/playbook `## Instructions`. Skill on/off is
`--ablation with-without`. The instructions mode is chosen when the case is
generated. #523 adds `iterate --instructions inline|playbook` (inline stays the
default). Until it lands, only the scaffolding exists:

1. For each fixture to compare, add a sibling under `test-cases/fixtures/`
   whose name ends in `-playbook` and whose `input.json` adds
   `"args": ["--instructions", "playbook"]`. Then run
   `npx vitest run test-cases -u` and review the new snapshots.
2. Generate the playbook arm outside `evals/` (the default suite and its
   pruning never see it); an `--out` inside `evals/`, including through a
   symlink, is rejected. Cases without
   a `-playbook` snapshot are skipped and listed. So are the fixture-less cases,
   which would match the inline arm. `--out` must be a new or empty
   directory, or one an earlier playbook run created (it leaves a
   `.pr-shepherd-playbook-evals` marker). Case directories left there by an
   earlier run that this run skipped are pruned.
   Transcript history stays inline; only the latest tick changes mode:

   ```sh
   node evals/generate.mjs --instructions playbook --out /tmp/pr-shepherd-evals-playbook
   ```

3. Run both arms with the same flags and compare:

   ```sh
   CLAUDE_CODE_EFFORT_LEVEL=low claude plugin eval . --model claude-sonnet-5-5 \
     --ablation with-without --judge-model opus --no-publish \
     --output-dir evals/results/inline
   CLAUDE_CODE_EFFORT_LEVEL=low claude plugin eval . --model claude-sonnet-5-5 \
     --ablation with-without --judge-model opus --no-publish \
     --eval-dir /tmp/pr-shepherd-evals-playbook --output-dir evals/results/playbook
   node evals/analyze.mjs --instructions-ablation evals/results/inline evals/results/playbook
   ```

`--instructions-ablation` restricts the inline results to the cases the
playbook arm ran. It refuses to compare when the playbook arm is missing a case
that has a `-playbook` snapshot, such as after a narrower `--case` filter. It blanks the latest tick's `## Instructions` section before
the drift check, since only that section differs. Replayed history, including
its inline `## Instructions`, the rest of each prompt, graders,
run config, agent model, judge and plugin version must still match. The inline arm's cost line covers its whole run.
Generate both arms with the same `EVAL_RUNS_*` overrides (or none), because the
run count is part of that check.

Without `--instructions`, the generator's output is unchanged.

## Design: why no case runs the CLI

The skill is a thin dispatcher: parse args, invoke the CLI, print the output,
and follow the output's own `## Instructions`. Its behavior is text in,
behavior out, so an embedded recording makes the input deterministic and
measures where the skill adds value. Mocks under `evals/mocks/` would not help:
they intercept MCP calls, not a CLI run through Bash. MCP cannot carry the loop
anyway, because its tools hit a 60s timeout.

## What this does NOT measure

- **Tool-call count, token usage, context size.** No case invokes anything.
  Measuring the fan-out that pr-shepherd replaces needs Bash in the baseline arm
  (see below). For scale, a shepherd tick is ~325 tokens at the median; a
  single `gh run view --log` routinely runs to tens of thousands.
- **Whether the CLI produces correct output.** That is covered by
  `test-cases/**` and the unit suite.
- **Target resolution itself.** Roughly a third of real invocations carry no PR
  identifier. Case `37-no-target-infers-branch` grades only the plan: invoke the
  CLI with no target instead of looking the PR up first. No case runs the CLI,
  so whether it resolves the right PR from the checkout is not executed or
  validated here; that is the CLI's own test suite.

## Environment constraints

- **`--allow-tools` is the only way to grant Bash.** A case's `allowed_tools`
  can only narrow, and a skill's `allowed-tools:` frontmatter does not grant.
- **Bash-granting runs abort when `~/.docker` contains a symlink.** Flatten the
  store; its root may be a link.
- **The runner needs an unsandboxed `/tmp`** (`EPERM … mkdtemp '/tmp/e-…'`).
- **A Claude Code worktree-isolated session cannot launch `plugin eval`.** Its
  guard misreads the subcommand as shell `eval`. Run it from a normal shell.
- `--mocks record` is the default, and a plugin MCP server with no mock is not
  started. The default judge is haiku, so always pass `--judge-model`.
  `--allow-tools 'mcp__*'` is rejected as malformed.

## Effort passthrough

`CLAUDE_CODE_EFFORT_LEVEL` in the operator's shell appears to reach the child
runs. Case `16`, 3 runs per level, sonnet 5.5, agent cost only (judge excluded):

| Level  | Agent cost / run   | Duration / run | Score |
| ------ | ------------------ | -------------- | ----- |
| `low`  | $0.0845            | ~22s           | 1.00  |
| `high` | $0.0979 (**+16%**) | ~26s           | 1.00  |

The inert `CLAUDE_EFFORT` moved cost by under 3% (see HISTORY.md). A 16% gap on
a short, ceiling-scoring case is consistent with a live setting, but n=3 on one
case is not proof. Rerun this check whenever the runner changes. Setting the
variable in a case's `env:` block fails every run: the runner accepts only
`EVAL_*` keys there.

## Next steps

1. **Add a stack Branch-update fixture.** No snapshot emits the
   `Playbook: "Branch update"` route (`gh stack checkout` / `rebase` / `push`),
   so the "rebase the whole stack, never one layer" rule is only covered
   indirectly by `17`. Add the CLI snapshot first, then the case.
2. **Add fixtures for #463 (check blocked by another PR) and #471
   (classification auto-resolve)**, then cases for them.
3. **Fix the haiku trigger rate (53%).** One line in the skill `description`
   moved a sibling suite from 44% to 94%.
4. **Run the discriminating tier at `runs: 6`.** At `runs: 3` the without arm
   alone swung ±0.44 on one case with no change. The recipe is in "Tiers and run
   recipes"; it still needs a live run to confirm the intervals tighten.
5. **Unblock the call-count and token measurement.** Flatten `~/.docker`, then
   build a suite that grants Bash to both arms. Watch for the inverted failure:
   with no working binary, the with-arm tries the CLI, fails, and Δ goes negative.
6. **Run the `[Required]` approval-gate case.** Fixture `142` and case `43`
   now cover the positive direction of `08`; neither has run live yet.
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
    log tails. Re-run case `04` to confirm the playbook's `gh run view` step is
    no longer needed.
12. **More playbook-only stack cases.** `24` shows the pattern: stack rules
    printed in the output sit at ceiling, and rules found only in a playbook
    discriminate. Next candidate: a merge-queue ejection (fixture `98`).
