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
```

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
- `cases/core.mjs`: cases 01–13.
- `cases/stack.mjs`: cases 14–22 and 24.
- `cases/recent.mjs`: case 23.

Case numbers are stable. Add new cases at the end instead of renumbering.

## Cases

Each case embeds a real recorded CLI output from
`test-cases/snapshots/<name>/output.text.md`. Both arms get identical text; the
only difference is whether the skill is in context. When the skill fires, the
agent gets `SKILL.md` plus any `references/` playbook a step names. So Δ measures
the dispatcher and the playbooks together. Isolating the playbooks would need a
third arm.

| Case                                   | Fixture | Rule under test                                              |
| -------------------------------------- | ------- | ------------------------------------------------------------ |
| `01-ci-in-progress-no-watch`           | `09`    | Don't block on `gh run watch`; iterate                       |
| `02-mark-ready-continue`               | `07`    | `MARK_READY` is non-terminal                                 |
| `03-multi-category-fix`                | `54`    | Four categories at once, none dropped                        |
| `04-real-failure-no-blind-rerun`       | `61`    | `[rerun authorized]` is not a recommendation                 |
| `05-cancelled-must-rerun`              | `14`    | `CANCELLED` _must_ rerun (mirror of 04)                      |
| `06-fix-code-dismiss-stale-bot`        | `60`    | Authorized stale bot dismissals stay autonomous              |
| `07-fix-code-bot-and-thread`           | `84`    | Preserve both review-thread and bot-review work              |
| `08-mergeability-diagnosis`            | `32`    | `[Not Required]` is not a blocker                            |
| `09-cancel-terminal-beats-work`        | `82`    | Merged PR needs nothing                                      |
| `10-external-check-no-handoff`         | `12`    | External URL is not an escalation trigger                    |
| `11-wait-no-work`                      | `24`    | `WAIT`: continue, invent nothing                             |
| `12-annotations-already-surfaced`      | `55`    | Act on the annotation, don't refetch                         |
| `13-neg-github-review-api`             | —       | Should NOT fire (knowledge question)                         |
| `14-stack-layer-no-direct-merge`       | `85`    | A stack layer merges via `--stack --merge`, not `gh pr merge` |
| `15-stack-owned-layers-before-handoff` | `102`   | Shepherd owned layers before a lower layer's human handoff   |
| `16-stack-all-owned-concurrent`        | `106`   | Every owned layer at once, none serialized or dropped        |
| `17-stack-parent-conflict-owned-only`  | `94`    | Route only the listed layer; don't hand-rewrite the child    |
| `18-stack-queued-lower-waits`          | `91`    | Never rewrite a queued layer                                 |
| `19-stack-merge-prefix`                | `90`    | `gh stack merge <prefix>`, shepherd the stale tip, rerun     |
| `20-stack-closed-parent-escalate`      | `100`   | Closed parent: stop and ask, don't pick a repair             |
| `21-stack-all-terminal-stop`           | `87`    | Every layer merged: stop (ceiling guard; flat Δ expected)    |
| `22-stack-auto-ready-disabled-probe`   | `104`   | Probe first; `gh pr ready` only on the described `WAIT`      |
| `23-behind-base-rebase-hint`           | `73`    | Rebase `--force-with-lease` before pushing the review fix    |
| `24-stack-merge-missing-extension`     | `97`    | Missing `gh stack`: install it, don't merge per layer        |
| `25-multi-pr-cancel-is-per-pr`         | `03`    | One PR's `CANCEL` ends only its loop; keep shepherding #43   |
| `26-conflicts-rebase-without-asking`   | `27`    | Conflicts: rebase, `--force-with-lease`, don't ask first     |

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
- **Target resolution from conversation.** Roughly a third of real invocations
  carry no PR identifier; every case here supplies a URL.

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
4. **Raise `runs` on the stable cases** (`01`, `02`, `05`, `10`). At `runs: 3`
   the without arm alone swung ±0.44 on one case with no change.
5. **Unblock the call-count and token measurement.** Flatten `~/.docker`, then
   build a suite that grants Bash to both arms. Watch for the inverted failure:
   with no working binary, the with-arm tries the CLI, fails, and Δ goes negative.
6. **Add a `[Required]` approval-gate fixture.** Nearly every snapshot is
   `Approvals: None [Not Required]`, so `08` cannot check the positive
   direction.
7. **Add a bad-workflow-YAML fixture**, if the CLI surfaces that state at all.
   If it doesn't, that's a CLI gap and no eval can close it.
8. **Watch the over-trigger rate, not just Δ.** A widened skill `description`
   can start activating on unrelated GitHub questions while every score looks
   healthy.
9. **Split `analyze.mjs`'s case fingerprint into scored vs display-only**, and
   **hash the plugin source in its guard**. #426 added a whole skill at the same
   version, so the `name@version` check passed on a changed treatment.
10. **Wire the sonnet tier into CI** for PRs touching
    `plugins/pr-shepherd/skills/**`.
11. **Surface the failing jobs' log tails when the failing job is a gate.**
    The `04` fix has the agent run `gh run view --log-failed`. Per "Surface
    data, don't classify it", the CLI should print that evidence itself. This
    is a CLI and snapshot change, tracked in #491.
12. **More playbook-only stack cases.** `24` shows the pattern: stack rules
    printed in the output sit at ceiling, and rules found only in a playbook
    discriminate. Next candidate: a merge-queue ejection (fixture `98`).
