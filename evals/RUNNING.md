# Running the evals

How to run the suite, read a result, and pick run counts. Current results are in
[EVALS.md](EVALS.md); the case list is in [CASES.md](CASES.md).

## Commands

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
  At `runs: 3` the noise floor is about ±0.44, so an unstarred Δ is
  inconclusive: its interval includes 0, which is not evidence of no effect.
  Consider more runs before demoting a case to a one-run guard. A case with fewer than two runs in an arm has no interval and is
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
`cases/*.mjs` from the last full run (2026-11-09).

- `discriminating`: the arms separated with an interval that excludes 0, or the
  with-arm is below 0.9: `01`, `02`, `04`–`08`, `11`, `12`, `21`, `22`,
  `27`–`31`, `33`, `35`–`38`, `40`, `43`, `47`–`51`, `55`, `56`. `21` and `35`
  stay here on their 2026-10-12 `runs: 6` result. These get the runs. A new case starts here
  too, so a targeted run measures it; `--summary` lists it for demotion if its
  interval includes 0.
- `guard`: everything else. Both arms sit at or near ceiling, so the case only
  exists to notice a regression. One run each is a cheap sweep.

`EVAL_RUNS_DISCRIMINATING` and `EVAL_RUNS_GUARD` override the per-case `runs`
(a case's own `runs`, else 3) at generation time. Cases `38`, `39` and
`43`–`56` commit their own `runs: 6`, whatever their tier, because at 3 the
without arm alone has swung ±0.44; `40`–`42` do not. Regenerate, run, then
regenerate without the variables so the tree matches the committed cases:

```sh
# Targeted run: signal where it matters, one regression look elsewhere.
EVAL_RUNS_DISCRIMINATING=6 EVAL_RUNS_GUARD=1 node evals/generate.mjs
CLAUDE_CODE_EFFORT_LEVEL=low claude plugin eval . --model claude-sonnet-5-5 \
  --ablation with-without --judge-model opus --no-publish
node evals/generate.mjs        # restore the committed suite

# Full sweep: the committed runs (3, or the case's own 6).
node evals/generate.mjs
```

### Sharded runs

One `claude plugin eval` process keeps `-j` runs in flight, so a full sweep takes
hours. To go faster, split the generated cases into shards, run each shard in its
own terminal tab, and merge the results:

```sh
node evals/shard.mjs split 4 evals-shards          # balanced by run count; optional case prefixes
# one tab per shard:
CLAUDE_CODE_EFFORT_LEVEL=low claude plugin eval . --model claude-sonnet-5-5 \
  --ablation with-without --judge-model opus --no-publish -j 8 \
  --eval-dir evals-shards/shard-1 --output-dir "$TMPDIR/sweep-1"
# after every shard finishes:
node evals/shard.mjs merge "$TMPDIR/sweep" "$TMPDIR"/sweep-{1,2,3,4}
node evals/analyze.mjs --summary "$TMPDIR/sweep"
rm -rf evals-shards
```

Run `split` after any `generate.mjs` overrides, because it copies the case
directories as they are. The shard root must sit below the plugin directory, as
`--eval-dir` requires. The merged result points each case back at `evals/<case>`
for its tags, so `analyze.mjs` weighs it like a single run. Concurrency is the
shard count times `-j`; lower `-j` if runs start failing on rate limits.

A comparison needs both tiers generated with the same overrides, because the run
count is part of the scored fingerprint. Move a case between tiers by editing its
`tier` in `cases/*.mjs` after a run shows it separating the arms (or not).

### Weighted score

Not every rule costs the same when an agent gets it wrong. Each case carries an
`area` tag (`AREA_WEIGHTS` in `lib.mjs`), and `--summary` leads with the mean Δ
weighted by it, then the mean per area:

| Area     | Weight | What it covers                                                                                               | Cases                                                                              |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `github` | 3      | CI rerun policy, cancelled runs, stacks, merge queues, mergeability, REST and proxy limits, review mechanics | the rest                                                                           |
| `safety` | 2      | Prompt injection (in reviews, logs or event payloads) and over-triggering                                    | `13`, `29`, `30`, `41`                                                             |
| `loop`   | 1      | Mark-ready, a missing PR id, creating a PR, cancel/wait discipline, single ticks, the journal                | `01`, `02`, `09`, `11`, `25`, `31`, `32`, `34`, `37`, `40`, `42`, `44`, `54`, `55` |

A GitHub gotcha done wrong reruns a real failure, requeues a broken merge
group, or merges a stack out of order; a loop rule done wrong costs a turn or a
question to the user.

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
- `cases/rules.mjs`: cases 29–37, 56 and 57, one per skill or CLI rule that had no case. A case may set `transform` (edit the recorded text, used to plant an injection) or `plan: true` (no fixture; the prompt is the whole input).
- `cases/deferred.mjs`: cases 38, 39 and 43, the rules that first needed a new
  CLI snapshot.
- `cases/cloud.mjs`: cases 40–42, the cloud event loop (single ticks).
- `cases/multiturn.mjs`: cases 44–46, long-session variants of ceiling cases
  (see "Multi-turn cases" in [CASES.md](CASES.md)).
- `cases/stack-fixes.mjs`: cases 47–52, agent behavior on the output of recent
  native-stack fixes (#509, #567, merge-queue removal of a stack layer, the
  REST stack queue guard).
- `cases/review-budget.mjs`: case 53, the per-tick review output budget
  (`iterate.review-output-max-chars`).
- `cases/aggregate.mjs`: cases 54 and 55, explicit multi-PR aggregate polls.

A case may also set `runs` (default 3). Cases 38, 39 and 43–56 use 6.

Case numbers are stable. Add new cases at the end instead of renumbering.

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

## Environment constraints

- **`--allow-tools` is the only way to grant Bash.** A case's `allowed_tools`
  can only narrow, and a skill's `allowed-tools:` frontmatter does not grant.
- **Bash-granting runs abort when `~/.docker` contains a symlink.** Flatten the
  store; its root may be a link.
- **The runner needs an unsandboxed `/tmp`** (`EPERM … mkdtemp '/tmp/e-…'`).
- **A Claude Code worktree-isolated session cannot launch `plugin eval`.** Its
  guard misreads the subcommand as shell `eval`. Run it from a normal shell.
- **The runner refuses a plugin directory with more than 20000 entries.**
  Every run errors with "a plugin directory holds more than 20000 entries to
  check for eval directories". A main checkout whose `.claude/worktrees` holds
  agent worktrees passes that easily, so run from a fresh
  `git worktree add --detach` checkout (about 11.5k entries).
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
