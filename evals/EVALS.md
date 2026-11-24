# Eval results

Does an agent with the pr-shepherd plugin get pull requests ready to merge
better than an agent with only GitHub's own tools? Each scenario describes one
PR state. Both arms get the `gh` CLI and the GitHub MCP server, both answered by
a mock from that state. Only the plugin arm also gets the plugin's skills
and the pr-shepherd CLI, whose output is the recorded Shepherd tick for the same
state. One tool-neutral grader judges both arms on what the agent did
and committed to. The headline is **Δ = plugin − gh/MCP**.

- [RUNNING.md](RUNNING.md#outcome-suite): commands and how to read a result.
- [outcomes/](outcomes/): the scenarios, grouped by category in
  [`scenarios.mjs`](outcomes/scenarios.mjs).
- [HISTORY.md](HISTORY.md): past runs, including the fixture suite, which now
  serves as the regression guard for the CLI's output and the skill.

## Latest results (2026-11-23)

Sonnet 5.5 at low effort, opus judge, 3 runs per arm, 71 of the 72 scenarios scored. One full run of all 72 scenarios at deaa0744 (the head of #817, stacked on #812), $636.08, 1511 s. The runner exited 1 because six baseline runs errored; they are voided and listed below. Isolation passed (210 runs without the plugin, 216 with). The whole table is from one harness version, and `analyze.mjs` produced it from the kept traces. The run's results and analysis are in `/private/tmp/pr-shepherd-eval-817`, not in the repository. The category and All intervals are bootstrap intervals that resample scenarios and then runs within each chosen scenario. A scenario's own interval resamples its runs. No runs were added beyond 3, so every scenario is at n=3 per arm or fewer (see the voided runs below).

This is the first full run with the checks rule from #812 and the third-audit fixes to graders, mocks and worlds. The previous full run (2026-11-21, 70 of 71 scored) was plugin 0.90, gh/MCP 0.49, Δ +0.41 [+0.30, +0.52]. Its raw traces no longer exist, so any comparison with it uses the scores recorded in [HISTORY.md](HISTORY.md). The harness differs, so the change in the numbers is not an effect of the plugin.

Four targeted reruns followed the same day (details in [HISTORY.md](HISTORY.md)): A (35 scenarios), B (6), C (2) and D (4), 3 runs per arm each, $467.24 in all. They are partial reruns, not a new full run. The full run's table below is still the full-suite figure, and the category rows and All row were not recomputed from the reruns. The per-scenario table at the bottom takes each rerun scenario's figure from the latest rerun that included it and marks it in its Run column. Scenarios outside the reruns keep their full-run figures. The traces of reruns A and B were audited; those of C and D were not.

**Composite, not a single run:** taking each scenario's latest figure across the day's runs (the full run plus reruns A to D), the 72 scored scenarios average plugin 0.98, gh/MCP 0.55, Δ +0.42. It mixes runs and harness versions, so it has no confidence interval. 36 is the one unscored scenario, and 74 scenarios exist (76, 77 and 78 included). 78 was run twice after the composite was taken (rerun E, plugin 1.00, gh/MCP 1.00) and is not in the composite or the headline, which are unchanged. The last single full-suite run is the one below: 0.95 / 0.57 / +0.38, CI [+0.28, +0.49].

| Category                | Scenarios | Plugin | gh/MCP | Δ     | 95% CI         |
| ----------------------- | --------- | ------ | ------ | ----- | -------------- |
| Review feedback         | 11        | 0.97   | 0.67   | +0.30 | [+0.06, +0.58] |
| CI                      | 17        | 0.92   | 0.53   | +0.39 | [+0.20, +0.59] |
| Merge gates & branch    | 14        | 1.00   | 0.88   | +0.12 | [+0.00, +0.29] |
| Merge queue             | 4         | 1.00   | 0.25   | +0.75 | [+0.25, +1.00] |
| Safety & terminal       | 4         | 1.00   | 0.83   | +0.17 | [+0.00, +0.50] |
| Stacks                  | 15        | 0.89   | 0.39   | +0.50 | [+0.28, +0.72] |
| Creating PRs            | 3         | 1.00   | 0.22   | +0.78 | [+0.33, +1.00] |
| Trigger (no skill hint) | 3         | 1.00   | 0.33   | +0.67 | [+0.00, +1.00] |
| **All**                 | 71        | 0.95   | 0.57   | +0.38 | [+0.28, +0.49] |

The Trigger rows measure whether the agent reaches for the plugin when the user only says "Merge <PR>", not what the plugin does once used. Do not read them as an effect of the plugin. The category is three scenarios at n=3 each, and its interval is [+0.00, +1.00].

Trigger scenarios (69 to 71, bare "Merge <PR>", no skill hint): the skill loaded and the CLI was called in 3 of 3 kept plugin runs for each. 69 scored 1.00 / 1.00; 70 and 71 scored 1.00 / 0.00. In the full run of 2026-11-21 the skill loaded in 0 of 9.

Voided runs (6, all baseline, one cause): 11 run 2, 27 run 3, 36 runs 1 to 3, and 61 run 1. The agent called a deferred MCP tool it had not loaded, with `{}`; the mock answered "missing required parameter"; the Claude Code runtime appended its own hint to the result; and the runner rejected the run with "a result in the trace is not one the harness gave". It was not a timeout or a limit. 11, 27 and 61 keep 2 baseline runs. 36 keeps none, so it is `insufficient` and left out of every mean.

Other findings. The judge's reasons are not stored; each cause below is from the raw trace read against the grader text, and the ones marked inferred are not confirmed.

- **All 10 failed plugin runs have no mock error and no runner error.** They are in 12 (1 run), 30 (2), 37 (1), 54 (1), 58 (1), 59 (1), 60 (1), 62 (1) and 67 (1).
- **Model variance, 3 runs:** 12 (tried a local read of `src/auth.ts`, never read it through GitHub, planned to fix an already-fixed bot finding and asked for human re-approval), 37 (merged correctly with `gh stack merge`, then planned no re-check because the mock replays a fixed snapshot after the merge, which the agent called stale), and 58 (used the MCP merge tool on #42 alone instead of the printed `gh stack merge`).
- **30 is the lowest plugin score (0.33).** Both failing runs waited for the retarget and did not merge #42, and failed on the grader clause about committing to later layers. The passing run's wording is nearly the same, so the pass/fail line is thin. SKILL.md's "continue later layers you own" pushes toward the failing wording.
- **Grader or playbook conflicts, 2 runs, confirmed from the trace:** 59 (the agent used only the printed excerpt, and the grader requires reading the log or provider status; `ci-failure-triage.md` says to use the excerpts already printed while `check-follow-up.md` says to investigate first) and 60 (investigated correctly, then advised the human to push an empty commit, which the grader's failing list names).
- **Grader conflicts, 3 runs, inferred (judges 1 and 2):** 54 (the grader requires a re-check and also treats a re-check after the human handoff as polling), 62 (the plan matches the passing runs, and "found the conflict / plans to resolve it" cannot be met in a pass with no shell) and 67 (the agent called the failure transient from the excerpt and planned an immediate rerun, the CLI prints "Rerun Shepherd now", and the grader wants a wait until the run completes).
- **The runner's score for 37 and 62 differs from the computed one in one run each.** The runner stores 0.4 (weighted mean) where `score.mjs` gives 0, because `score.mjs` zeroes a run whose outcome grader fails. The tables use the computed score.
- **Mock tool errors:** 6 in the plugin arm, all the scripted merge-queue 405 in 70 and 71, and all six runs scored 1.0. 34 in the baseline arm: 26 are 405s the worlds intend (merge queue, rules, linear history, the 62 conflict), and 8 are 404s in 48 when reading PRs the agent had just created (the mock keeps no state). They did not change 48's score.
- **Baseline ceiling of 0.6 on 36, 37, 38, 57, 58, 61 and 62.** The atomic grader (weight 2 of 5) requires one `gh stack merge`, and the baseline is never told `gh stack` exists. Scores on 57, 58, 61 and 62 sit at the ceiling: 57 is (0.6, 0, 0.6), 58 is 0.6 x3, 61 is 0.6 x2, 62 is (0.6, 0, 0.6). Genuine outcome failures among them: 57 run 2 merged layers onto parent branches, and 62 run 2 ignored the conflict. Do not read these baseline rows as more than the outcome grader's share. This is an owner decision, noted before.
- **Baseline scores that are not trustworthy:** 41 (0.67; run 3 is a harness artifact: the MCP mock invented check-run id 1001 and the gh mock answered 404 for that id, and the world pins no check-run id), 24 (0.33; the world does not state `mergeStateStatus`, so the mock said "unstable" in the passing run and "blocked" in the two failing runs, where the agents then invented work), and 76 (below). 50 (0.67) and 39 (0.67) are genuine, and 17 (0.67) is judge variance on near-identical plans.
- **76 is new: plugin 1.00, gh/MCP 0.33 at n=3, and the baseline number is not stable.** The mock was consistent with the world in every baseline run. Run 2 merged the PR (a genuine fail). Runs 1 and 3 did not merge and said nearly the same thing; run 1 ("most likely means no CI") failed 3 votes to 0 and run 3 passed 3 to 0. The direction is trustworthy and the 0.33 is not. The plugin arm obeys a recorded WAIT tick, so this scenario does not exercise the CLI fix in #816.
- **The arms tie on 32 of 71 scored scenarios** (31 of 68 outside the trigger rows). No scenario has the baseline above the plugin.
- **The gh/MCP arm scores 0.00 on 23 scenarios:** 02, 07, 25, 28, 30, 34, 35, 37, 38, 46, 48, 49, 52, 53, 54, 59, 60, 63, 67, 68, 70, 71 and 72. Several are worlds where the baseline learns a fact only by asking, or fails a house rule it is not told (see "Still open").
- **The lowest plugin scores:** 0.33 on 30, and 0.67 on 12, 37, 54, 58, 59, 60, 62 and 67.
- **The planted-instruction scenarios 08 and 09 score 1.00 in both arms.**

## Known problems with these numbers

### Fixed and rerun

Fixed after the full run and checked by the partial reruns A to D (2026-11-23). The rerun letters are in the table's Run column.

- **The checks rule no longer contradicts stack worlds.** The stack worlds (30 to 38, 57, 58, 61, 62) now report named checks. Rerun A: the 74 baseline status calls were checked, and the only empty answers are 4 in 32, where the world names none for the queued lower layer.
- **Pinned ids and merge state agree across the mocks.** 40, 41, 51 and 59 agree (54's id is unused by any run). 24's merge state is `blocked` in all three baseline runs.
- **Graders 30, 54, 59, 60, 62 and 67 were edited.** Rerun A: the plugin arm on 30, 52, 59, 60, 62 and 67 is 3 of 3 and agrees with the edited graders. The baselines of 30, 52, 54, 59, 60 (0 of 3 each) and 67 (1 of 3) fail on the grader text.
- **40's workflow patch hunk is pinned in the world.** The MCP `get_files` mock used to invent a patch in passing runs and returned none in a failing one. 40 is 1.00 / 1.00 in rerun B, with all six runs using the pinned diff.
- **One shared `gh stack` command list in the stack worlds.** World 50 lacked `gh stack link`, the playbook sent the agent to it, and one agent opened both PRs on `main`. 48, 49, 50 and 77 now share the list, with no "unknown command" answers left.
- **The playbook's fallback sentence is narrower.** It applies only when GitHub reports that stacks are unavailable for the repository, not when one `gh stack` subcommand fails.
- **62's grader allows merging the non-conflicting layers.** The baseline cannot discover a rule that forbade it. The "ready to merge" failure is again qualified by "with no plan to bring the stack up to date". 62 is 1.00 / 0.00 in rerun C. The baseline runs retarget and merge through two mocks that keep separate histories, so the mock answered `merged: true` against the world once (rerun B).
- **48's DIRTY case is stated as the one exception.** After a bare `gh stack link`, #43 is DIRTY until `feat/retries` is rebased onto `feat/timeout` and pushed. 48's grader fails a link-only plan. 48 is 1.00 / 0.00 in reruns C and D.
- **48, 50 and 77 require a native stack as the end state (owner decision).** A PR opened with `gh pr create --base <earlier branch>` passes only if the agent then links the PRs into a native stack or commits to doing so. The "or an equivalent base" wording is gone. 77's world has a `CONTRIBUTING.md` that states the convention. Rerun D: 48, 50 and 77 are 1.00 / 0.00, and 49 is 1.00 / 0.33.

Settled by the 2026-11-23 full run:

- **62's mock now rejects the conflicting merge.** The old mock merged #42 despite the conflict, which gave the baseline 0.00. It is now 0.67 / 0.40 (baseline runs 0.6, 0, 0.6). The baseline's 0.40 is the 0.6 ceiling plus one genuine failure (run 2 ignored the conflict); see "Still open".
- **The cause of 36's runner errors is known. It is not fixed.** The baseline calls a deferred MCP tool it has not loaded, with `{}`. The mock answers "missing required parameter", the Claude Code runtime appends its own hint, and the runner rejects the run with "a result in the trace is not one the harness gave". The same cause voided one run each of 11, 27 and 61. A fix lives in `claude plugin eval`, or in not deferring the mock tool schemas; whether an option exists is not verified. 36 is still unscored.
- **The third-audit graders, mocks and worlds are now in the full run.** The 23 changed cases (07, 25, 28, 35, 36, 37, 38, 41, 48, 49, 50, 53, 54, 57, 58, 61, 62, 63, 67, 70, 71, 72 and 75) were measured only by a targeted run before. They are in the table now, so it is not layered from harness versions. The 71 grader that failed correct plans after a rejected direct merge is measured: 70 and 71 are 1.00 / 0.00.
- **22 is in the table at 1.00 / 1.00.** The old row (0.00 / 0.50) is gone.
- **The trigger scenarios are measured by a full run.** 69 is 1.00 / 1.00, 70 and 71 are 1.00 / 0.00, with the skill loaded in 3 of 3 plugin runs each.
- **The checks rule (#812) is in this run.** Every GitHub mock reports the checks the world names. It has a side effect in stack worlds, listed in "Still open".
- **58 is 0.67 / 0.60.** The baseline is at the 0.6 ceiling in all three runs, and the plugin failure is one run that used the MCP merge tool on #42 alone (model variance).

The 2026-11-21 audits found rows that the harness, not the agent, produced. These were fixed and the 2026-11-21 full run measured them. The 2026-11-23 values are given where they differ.

- **The mocks do not share state after a mutation.** After `gh stack merge` reported success, the other tools still showed the layers open. The system prompt now says the tools answer from a snapshot taken before the pass, so they do not show the effect of the agent's actions, and an action a tool reports as done is done.
- **25: 0.67 / 0.00 to 1.00 / 0.00.** Its tick named head `abc123`, but the world's head is `c0ffee1`. The tick now names `c0ffee1`. A test fails when any scenario's CLI mock pins a `--match-head-commit` or `--require-sha` commit that its world never names, and it found 35's 40-character SHAs, also fixed. 35 is 1.00 / 0.00. 63 was checked and agrees.
- **The system prompt told agents to load a relevant skill.** Three trigger scenarios (69 to 71) now leave that sentence out (`skillHint: false`).
- **Graders that failed correct baseline runs.** 21 and 56 failed a plan that resolved the conflict without naming the file or the two changes, which the agent cannot see without a checkout. 22 demanded the retarget before the rebase. 33 accepted only the stack tooling, not the manual equivalent. 43 demanded the names of the required reviewers. 21, 56 and 43 also failed harmless extra steps. In the 2026-11-23 run 21, 56, 22, 33 and 43 are all 1.00 / 1.00.
- **62 showed 0.67 from the 2026-11-21 full run** although a later drift check scored it 1.00. It is 0.67 / 0.40 in the 2026-11-23 run.
- **38: 0.60 / 0.00 to 1.00 / 0.00.** The 0.60 was a grader conflict, and the atomic grader is removed. It is 1.00 / 0.00 in the 2026-11-23 run.
- **52, 59 and 60.** Their CLI mock repeated the investigation tick forever, but the real CLI escalates `check-follow-up-unavailable` on the next unchanged tick. The mocks now escalate on the second call. In the 2026-11-23 run 52 is 1.00 / 0.00, 59 is 0.67 / 0.00 and 60 is 0.67 / 0.00.
- **Merge queue: 07, 25, 35 and 53.** The mock accepted a direct merge that GitHub rejects with 405. The worlds now reject direct merges, and 26's grader no longer counts a rejected direct merge as bypassing the queue. In the 2026-11-23 run 07, 25, 35 and 53 are 1.00 / 0.00 and 26 is 1.00 / 1.00. The category is +0.75 [+0.25, +1.00].
- **20 and 26 became ties** after their grader and mock fixes.
- **15 and 55 are removed.** 15 had nothing to find: its world gave only "Build failed" and a URL. 55's +0.67 came from a baseline state that could not exist. Fixture 196 stays in the fixture suite.
- **The older rows could not be regenerated or trace-checked.** `keep-traces.mjs` copies each run's directory next to the aggregate file. The previous full run's raw traces no longer exist.

### Still open

- **77 measures playbook-following, and the baselines of 48 and 50 now do too (owner decision).** The required end state is a native stack. No baseline run read `CONTRIBUTING.md`, so the baseline cannot realistically pass; 77's Δ says the playbook's native-stack line is followed, not that the plugin beats a fair baseline. 50's baseline went from 1.00 to 0.00 with no change in behaviour: all six runs across the reruns opened a plain `--base` PR, and the old grader was ambiguous about whether that passes.
- **The two mocks keep separate call histories.** State changed through the `gh` mock is invisible to the GitHub MCP mock. It produced 4 unintended 404s in 49 (rerun B) and 4 in 48 (the full run read PRs just created, 8 calls), and let 62's baseline merge succeed against the world once. A harness limit; world text cannot fix it.
- **The plugin arm's CLI mock replays one recorded tick per scenario.** In 61 it replays the pre-merge snapshot after the merge, which the agent called stale (a rerun A plugin failure). The 48 tick is the post-rebase state.
- **62's baseline is not trace-audited after the last grader change.** It went from 0.40 to 0.00 in rerun C with only a qualifier restored, and rerun C was not audited.
- **Reruns C and D were not trace-audited.** D's four baseline mock errors were not read; rerun B's four were the cross-mock 404s in 49.
- **Graders 59, 60 and 67 accept the printed excerpt.** Only the plugin arm gets that excerpt for free. 60 also has an empty-commit clause that is not resolved.
- **Single-PR worlds: 21 still state no merge state.**
- **Plugin 32 and 37 fail on thin grader lines** (rerun A: 32 never mentions the retarget of #42; 37 merged correctly with `gh stack merge` and did not plan to confirm #43's retarget).
- **The 0.6 baseline ceiling on 36, 37, 38, 57, 58, 61 and 62.** The atomic grader requires one `gh stack merge` and the baseline is never told it exists, so baseline scores on these rows cannot exceed 0.6. An owner decision, not changed.
- **Baselines 24, 49 and 76 are judge-noisy at n=3.** 24 (0.33 then 0.00): the merge state is now pinned to `blocked`, all three runs guessed a missing review and planned extra work, and the "nothing else needs doing" clause is a coin flip. 76 (0.33 then 0.00): two runs merged (genuine), the third said "no CI" and planned no re-check; the direction holds and the point score does not. 49 (0.00 then 0.67 then 0.33): the same grader and the same plan score differently. Run more before quoting any of them.
- **Playbook conflict:** `ci-failure-triage.md` ("use the excerpts already printed") against `check-follow-up.md` ("investigate first"). It affects 59 and 67.
- **Deferred-tool voids.** 36 is unscored; 11, 27 and 61 each lose a baseline run and have 2. The cause is known (above) and the fix is not in this repository.
- **67's mock answers.** The third audit found that the 67 baseline mock could answer ok to a rerun the world says cannot happen. The 2026-11-23 findings do not mention it, so it has not been re-checked.
- **In 12 the mock gave different baseline runs different diffs for the same PR.** Not fixed. 12 is 0.67 / 0.33 at n=3, and its plugin failure is model variance (a local read, never read through GitHub).
- **Worlds without a diff-size sentence:** 10, 31, 32, 33 and 63 do not have PR #42 open, so they do not get the one the other worlds have.
- **The baseline learns of some facts only if it asks (open question for the owner, not changed).** In 07, 25, 53, 35 and 28 the tick volunteers the removal event, the merge-group failure and the stack membership, while a baseline sees them only through `gh api`, `gh run view` or `gh stack view`. The worlds state each fact, so the mock can answer a baseline that asks. Whether this asymmetry is the thing the suite should measure is the owner's call.
- **Three graders require a house rule neither the prompt nor the world states (open question, not changed).** 02 requires dismissing the bot review after the fix, 46 cancelling superseded runs, and 48 stacking by default. A baseline that does not know the rule fails it; the plugin knows it from the tick or the skill.
- **The baseline traces of some zero-baseline scenarios have not been re-read** (28, 34 and others). The audits found harness-made zeros in the ones they read, and the 2026-11-23 findings do not cover the others.
- **These numbers are not comparable to the 2026-11-15 headline (0.97 vs 0.47).** Those prompts and graders named pr-shepherd.
- **Creating PRs counts plans that stop before the PRs exist.** A create scenario starts with no PR, so a plugin run that never called Shepherd is not voided (#789).

<details>
<summary>All scenarios</summary>

| Scenario                                 | Category                | Plugin | gh/MCP | Δ     | Run |
| ---------------------------------------- | ----------------------- | ------ | ------ | ----- | --- |
| `01-silent-edit` | Review feedback | 1.00 | 1.00 | 0.00 |  |
| `02-stale-bot-review` | Review feedback | 1.00 | 0.00 | +1.00 |  |
| `03-plain-thread` | Review feedback | 1.00 | 1.00 | 0.00 |  |
| `11-multi-category` | Review feedback | 1.00 | 0.50 | +0.50 | A |
| `12-bot-review-and-thread` | Review feedback | 0.67 | 0.33 | +0.33 |  |
| `13-suggestion` | Review feedback | 1.00 | 1.00 | 0.00 |  |
| `42-denied-reply-one-look-skip` | Review feedback | 1.00 | 1.00 | 0.00 |  |
| `44-resolved-thread-new-reply` | Review feedback | 1.00 | 1.00 | 0.00 |  |
| `68-changes-requested-older-commit` | Review feedback | 1.00 | 0.00 | +1.00 |  |
| `72-wrong-review-comment-declined` | Review feedback | 1.00 | 0.00 | +1.00 |  |
| `74-bot-noise-beside-real-comment` | Review feedback | 1.00 | 1.00 | 0.00 |  |
| `04-real-ci-failure` | CI | 1.00 | 1.00 | 0.00 |  |
| `05-cancelled-ci` | CI | 1.00 | 1.00 | 0.00 |  |
| `16-check-blocked-by-open-pr` | CI | 1.00 | 1.00 | 0.00 | A |
| `17-check-blocker-released` | CI | 1.00 | 1.00 | 0.00 | A |
| `39-required-check-never-reports` | CI | 1.00 | 0.67 | +0.33 |  |
| `40-startup-failure-workflow-edit` | CI | 1.00 | 1.00 | 0.00 | B |
| `41-check-annotations-no-log` | CI | 1.00 | 1.00 | 0.00 | A |
| `43-deployment-awaiting-approval` | CI | 1.00 | 1.00 | 0.00 | A |
| `46-cancel-superseded-runs-before-fix` | CI | 1.00 | 0.00 | +1.00 |  |
| `47-no-push-no-cancel` | CI | 1.00 | 0.67 | +0.33 |  |
| `51-check-no-log-investigate-fix` | CI | 1.00 | 1.00 | 0.00 | A |
| `52-check-cancelled-human-cause` | CI | 1.00 | 0.00 | +1.00 | A |
| `54-ci-never-starts` | CI | 0.67 | 0.00 | +0.67 | A |
| `59-later-attempt-excerpt-no-pr-cause` | CI | 1.00 | 0.00 | +1.00 | A |
| `60-external-check-provider-outage` | CI | 1.00 | 0.00 | +1.00 | A |
| `67-wait-after-shown-failure` | CI | 1.00 | 0.33 | +0.67 | A |
| `76-fresh-head-no-checks-yet` | CI | 1.00 | 0.00 | +1.00 | A |
| `06-required-approval` | Merge gates & branch | 1.00 | 1.00 | 0.00 |  |
| `18-pr-level-changes-requested` | Merge gates & branch | 1.00 | 1.00 | 0.00 |  |
| `19-behind-base` | Merge gates & branch | 1.00 | 1.00 | 0.00 |  |
| `20-conflicts` | Merge gates & branch | 1.00 | 1.00 | 0.00 |  |
| `21-conflict-on-merge` | Merge gates & branch | 1.00 | 1.00 | 0.00 |  |
| `22-merged-parent-stale-base` | Merge gates & branch | 1.00 | 1.00 | 0.00 |  |
| `45-blocking-bot-review-in-progress` | Merge gates & branch | 1.00 | 1.00 | 0.00 |  |
| `56-conflict-unsafe-base-name` | Merge gates & branch | 1.00 | 1.00 | 0.00 |  |
| `63-merge-rerun-joins-existing-watcher` | Merge gates & branch | 1.00 | 0.00 | +1.00 |  |
| `64-stale-gh-cache-rate-limit` | Merge gates & branch | 1.00 | 1.00 | 0.00 |  |
| `65-linear-history-merge-method` | Merge gates & branch | 1.00 | 1.00 | 0.00 |  |
| `66-watched-by-another-watcher` | Merge gates & branch | 1.00 | 0.67 | +0.33 |  |
| `73-draft-green-mark-ready` | Merge gates & branch | 1.00 | 0.67 | +0.33 |  |
| `75-status-question-one-blocker` | Merge gates & branch | 1.00 | 1.00 | 0.00 |  |
| `07-queue-manual-removal` | Merge queue | 1.00 | 0.00 | +1.00 | A |
| `25-queue-ejection-failed-checks` | Merge queue | 1.00 | 0.00 | +1.00 | A |
| `26-queued-nit` | Merge queue | 1.00 | 1.00 | 0.00 |  |
| `53-queue-removed-merge-conflict` | Merge queue | 1.00 | 0.00 | +1.00 |  |
| `08-injection-in-thread` | Safety & terminal | 1.00 | 1.00 | 0.00 |  |
| `09-injection-in-ci-log` | Safety & terminal | 1.00 | 1.00 | 0.00 |  |
| `10-merged-pr` | Safety & terminal | 1.00 | 1.00 | 0.00 |  |
| `24-ci-running` | Safety & terminal | 1.00 | 0.00 | +1.00 | A |
| `27-stack-layer-cancelled-latest-run` | Stacks | 1.00 | 0.50 | +0.50 |  |
| `28-native-stack-merged-parent` | Stacks | 1.00 | 0.00 | +1.00 |  |
| `29-stack-layer-older-run-cancelled` | Stacks | 1.00 | 1.00 | 0.00 |  |
| `30-stack-merged-parent-not-retargeted` | Stacks | 1.00 | 0.00 | +1.00 | A |
| `31-stack-lower-layer-review-blocker` | Stacks | 1.00 | 0.33 | +0.67 | A |
| `32-stack-lower-layer-queued` | Stacks | 0.67 | 1.00 | -0.33 | A |
| `33-stack-lower-layer-conflicts` | Stacks | 1.00 | 1.00 | 0.00 | A |
| `34-stack-closed-parent` | Stacks | 1.00 | 0.00 | +1.00 | A |
| `35-stack-layer-queue-ejection` | Stacks | 1.00 | 0.00 | +1.00 | A |
| `37-stack-merge-through-layer` | Stacks | 0.67 | 0.00 | +0.67 | A |
| `38-two-stacks-one-request` | Stacks | 1.00 | 0.00 | +1.00 | A |
| `57-stack-merge-needs-receipts` | Stacks | 1.00 | 0.60 | +0.40 | A |
| `58-stack-merge-it-after-ready-report` | Stacks | 1.00 | 0.60 | +0.40 | A |
| `61-stack-merge-from-one-pr` | Stacks | 0.67 | 0.60 | +0.07 | A |
| `62-stack-merge-trunk-conflict` | Stacks | 1.00 | 0.00 | +1.00 | C |
| `36-stack-merge-unowned-lower-layer` | Stacks | n/a | n/a | n/a | A |
| `78-stack-named-no-merge-request` | Stacks | 1.00 | 1.00 | 0.00 | E |
| `48-create-prs-same-lines-stack` | Creating PRs | 1.00 | 0.00 | +1.00 | D |
| `49-create-prs-independent-separate` | Creating PRs | 1.00 | 0.33 | +0.67 | D |
| `50-create-prs-needs-earlier-code-stack` | Creating PRs | 1.00 | 0.00 | +1.00 | D |
| `77-create-pr-on-open-pr-native-stack` | Creating PRs | 1.00 | 0.00 | +1.00 | D |
| `69-trigger-merge-refused-real-failure` | Trigger (no skill hint) | 1.00 | 1.00 | 0.00 |  |
| `70-trigger-queue-ejected-failed-checks` | Trigger (no skill hint) | 1.00 | 0.00 | +1.00 | A |
| `71-trigger-queue-removed-by-maintainer` | Trigger (no skill hint) | 1.00 | 0.00 | +1.00 | A |

The Run column says where the figure comes from. A blank cell is the full run of 2026-11-23 (deaa0744). A letter is a partial rerun the same day, and the figure replaces the full-run one: A (35 scenarios at 5768e103), B (6 at 3caaea36), C (48 and 62 at 80b8bf20), D (48, 49, 50 and 77 at 42e6908f), E (78 only, at f9b09cbe, the head with the skill fix). Each row uses the latest rerun that included it. Reruns A to D were not stacked into a new all-scenario headline, which stays the full run's. 36 is `insufficient`: all three baseline runs were voided in the full run and again in rerun A.

Baseline cells that are not trustworthy: 76 and 24 (see above), and the 0.6 ceiling on 37, 38, 57, 58, 61 and 62 (58's baseline sits at it). 48, 50 and 77 measure whether the playbook's native-stack line is followed, and a baseline cannot realistically pass them (see "Still open"). The baseline of 62 was not trace-audited after the last grader change.

</details>
