# Eval strategy

How the pr-shepherd eval suite works, what it measures, and what comes next.
Current numbers are in [README.md](README.md). Past runs and calibration are in
[HISTORY.md](HISTORY.md).

## Running

```sh
node evals/generate.mjs        # regenerate cases — edit the generator, never a case

claude plugin eval . --model claude-sonnet-5-5 --ablation with-without \
  --judge-model opus --no-publish

node evals/analyze.mjs <results-dir-a> <results-dir-b>   # compare two tiers
```

- **Δ is the headline** (with-plugin minus without-plugin), not the absolute
  score. A high absolute score with Δ ≈ 0 means the model does as well without
  the skill.
- **The judge stays on opus and off the agent tier.** A judge that is also the
  agent model favors its own answers.
- **Effort is set per case, not on the command line.** `plugin eval` has no
  `--effort` flag and ignores the ambient `CLAUDE_EFFORT` (see HISTORY.md).
  Every case carries `env: { CLAUDE_CODE_EFFORT_LEVEL: low }`. That variable is
  on the runner's `CLAUDE_CODE_*` passthrough allowlist. Whether it actually
  changes effort is under "Effort passthrough" below.
- Results land in `evals/results/`, which is gitignored. Before trusting an
  anomalous Δ, check `aggregate-result.json` for `grader threw`.
- CI regenerates the cases and fails on any diff, so a snapshot change cannot
  leave a committed prompt stale.

Layout:

- `generate.mjs`: the entrypoint and the design rationale.
- `lib.mjs`: the framing, grader helpers and writer.
- `cases/core.mjs`: cases 01–13.
- `cases/stack.mjs`: cases 14–22.
- `cases/recent.mjs`: cases 23 onward.

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
| `21-stack-all-terminal-stop`           | `87`    | Every layer merged: stop                                     |
| `22-stack-auto-ready-disabled-probe`   | `104`   | Probe first; `gh pr ready` only on the described `WAIT`      |
| `23-behind-base-rebase-hint`           | `73`    | Rebase `--force-with-lease` before pushing the review fix    |

Presence of a specific token is graded by regex (`gh stack merge 511`).
Absence of a behavior is graded by an LLM rubric: the framing asks the agent to
state what it chose not to do, and a regex would punish the string rather than
the behavior (see the calibration log in HISTORY.md).

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

Stack cases 14–23 came from agent-blackboard session history:

- **Layers nobody shepherded** ("why isn't anyone shepherding 9673 and 9677",
  "i think you lost track of your work"). → `15`, `16`
- **Merge order** ("if the lower stacks are ready, merge it first"). → `14`, `19`
- **Ignored rebase guidance** ("pr-shepherd tells you to rebase. why didn't you
  follow?"). → `23`, and `17` for its stack form

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

Unverified. The check: run one case with `CLAUDE_CODE_EFFORT_LEVEL` at `low` and
again at `high`, then compare `cost` in `aggregate-result.json`. A difference
within ~3% is the signature of an inert variable (that was the `CLAUDE_EFFORT`
finding). Record the result here.

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
