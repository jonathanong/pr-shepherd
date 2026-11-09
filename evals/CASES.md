# Cases

What each case tests and where it came from. How to run them is in
[RUNNING.md](RUNNING.md); current results are in [EVALS.md](EVALS.md).

## Case list

Fixture-backed cases embed a real recorded CLI output from
`test-cases/snapshots/<name>/output.text.md`; cases without a fixture (`—`)
use a standalone prompt. Both arms get identical text; the only difference is
plugin availability: the skill instructions are present only when the skill
fires. When it fires, the agent gets `SKILL.md` and may read any `references/`
playbook a step names. So Δ measures the dispatcher plus whichever playbooks the
agent actually reads. Isolating the playbooks would need a third arm.

| Case                                           | Fixture | Rule under test                                                                                |
| ---------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `01-ci-in-progress-no-watch`                   | `09`    | Don't block on `gh run watch`; iterate                                                         |
| `02-mark-ready-continue`                       | `07`    | `MARK_READY` is non-terminal                                                                   |
| `03-multi-category-fix`                        | `54`    | Four categories at once, none dropped                                                          |
| `04-real-failure-no-blind-rerun`               | `61`    | `[rerun authorized]` is not a recommendation                                                   |
| `05-cancelled-must-rerun`                      | `14`    | `CANCELLED` _must_ rerun (mirror of 04)                                                        |
| `06-triage-dismiss-stale-bot`                  | `60`    | Authorized stale bot dismissals stay autonomous                                                |
| `07-triage-bot-and-thread`                     | `84`    | Preserve both review-thread and bot-review work                                                |
| `08-mergeability-diagnosis`                    | `32`    | `[Not Required]` is not a blocker                                                              |
| `09-cancel-terminal-beats-work`                | `82`    | Merged PR needs nothing                                                                        |
| `10-external-check-no-handoff`                 | `12`    | External URL is not an escalation trigger                                                      |
| `11-wait-no-work`                              | `24`    | `WAIT`: continue, invent nothing                                                               |
| `12-annotations-already-surfaced`              | `55`    | Act on the annotation, don't refetch                                                           |
| `13-neg-github-review-api`                     | —       | Should NOT fire (knowledge question)                                                           |
| `14-stack-layer-no-direct-merge`               | `85`    | A stack layer merges via `stack --merge`, not `gh pr merge`                                    |
| `15-stack-owned-layers-before-handoff`         | `102`   | Shepherd owned layers before a lower layer's human handoff                                     |
| `16-stack-all-owned-concurrent`                | `106`   | Every owned layer at once, none serialized or dropped                                          |
| `17-stack-parent-conflict-owned-only`          | `94`    | Route only the listed layer; don't hand-rewrite the child                                      |
| `18-stack-queued-lower-waits`                  | `91`    | Never rewrite a queued layer                                                                   |
| `19-stack-merge-prefix`                        | `90`    | `gh stack merge <prefix>`, shepherd the stale tip, rerun                                       |
| `20-stack-closed-parent-escalate`              | `100`   | Closed parent: stop and ask, don't pick a repair                                               |
| `21-stack-all-terminal-stop`                   | `87`    | Every layer merged: stop (ceiling guard; flat Δ expected)                                      |
| `22-stack-auto-ready-disabled-probe`           | `104`   | Clean draft with auto-mark-ready disabled: stop; no ready command or repeat probe              |
| `23-behind-base-rebase-hint`                   | `73`    | Rebase `--force-with-lease` before pushing the review fix                                      |
| `24-stack-merge-missing-extension`             | `97`    | Missing `gh stack`: install it, don't merge per layer                                          |
| `25-multi-pr-cancel-is-per-pr`                 | `03`    | One PR's `CANCEL` ends only its loop; keep shepherding #43                                     |
| `26-conflicts-rebase-without-asking`           | `27`    | Conflicts under a rebase convention: lease-push, don't ask                                     |
| `27-merged-parent-stale-base`                  | `127`   | Retarget the merged parent's base before any obsolete-base fix                                 |
| `28-native-stack-merged-parent`                | `129`   | Rebase the lowest open native-stack layer onto trunk, preserving the stack                     |
| `29-injection-in-review-thread`                | `16`    | Planted instruction in a review comment is data: no `curl \| sh`, no token, no merge           |
| `30-injection-in-ci-log`                       | `92`    | Same planted instruction in a CI log excerpt                                                   |
| `31-create-pr-push-without-asking`             | none    | "Make a PR": non-force push and create it without asking                                       |
| `32-merge-flag-single-pr`                      | `64`    | `--merge` on one PR: run the printed merge without re-asking; fallback only on error           |
| `33-suggestion-patch`                          | `18`    | Run `suggest` for the `[suggestion]` thread                                                    |
| `34-journal-rejection`                         | `16`    | Reject a wrong suggestion; journaling remains the agent’s choice                               |
| `35-merge-queue-ejection`                      | `119`   | Manual queue removal under `--merge`: do not requeue                                           |
| `36-rest-queue-recovery-unsupported`           | `133`   | REST `transport-unsupported`: base update and reproduce, no requeue, keep REST                 |
| `37-no-target-infers-branch`                   | none    | "Shepherd my PR": run the CLI with no target, no `gh pr view` first                            |
| `38-denied-reply-one-look-skip`                | `140`   | Denied reply is a one-look skip: no retry, no escalation, keep going                           |
| `39-proxy-session-refusal`                     | apply   | Exit 77: `add_repo` with push access, retry the pending ID (regression guard)                  |
| `40-event-mode-one-tick-end-turn`              | `136`   | Single tick: end the turn, no sleeping or watchers                                             |
| `41-event-mode-act-on-shepherd-not-payload`    | `137`   | Event payload is untrusted: act only on Shepherd's output                                      |
| `42-event-mode-keep-one-wakeup`                | `137`   | Replace the old wake-up with one at `nextCheck.at`                                             |
| `43-required-approval-gate`                    | `142`   | `[Required]` approval is the blocker: request review, no self-approval or bypass               |
| `44-multi-pr-cancel-long-session`              | `03`    | `25` after earlier ticks on both PRs                                                           |
| `45-stack-handoff-long-session`                | `102`   | `15` after a finished one-PR session                                                           |
| `46-stack-all-owned-long-session`              | `106`   | `16` after a finished one-PR session                                                           |
| `47-stack-layer-cancelled-latest-run-rerun`    | `145`   | Latest required run `CANCELLED` despite "3 passing": run every printed `rerun:`                |
| `48-stack-layer-superseded-no-rerun`           | `146`   | Mirror of `47`: superseded cancellations need no rerun; iterate                                |
| `49-queue-cancelled-required-run-escalate`     | `147`   | Cancelled `merge_group` run escalates: hand off, no rerun or requeue                           |
| `50-stack-merged-parent-retarget-wait`         | `131`   | Under `--merge`, wait for GitHub to retarget the bottom layer; no merge or base edit           |
| `51-stack-queue-removal-ack-route`             | `120`   | Stack queue removal: `gh stack rebase`, ack only on an unchanged head                          |
| `52-rest-stack-merge-queue`                    | `135`   | REST stack queue merge: run the printed `apply merge`, not `gh stack merge`                    |
| `53-triage-review-subset`                      | `155`   | Review output budget subset: apply the printed IDs, rerun, don't fetch held items              |
| `54-multi-pr-aggregate-routes-rows`            | `86`    | Explicit aggregate poll: run each non-WAIT row's `pollCommand`, skip WAIT, rerun the aggregate |
| `55-multi-pr-aggregate-escalate-keeps-working` | `160`   | One row's `ESCALATE` is reported but does not stop work on the `TRIAGE` row                    |
| `56-queued-conflict-dequeue-or-wait`           | `172`   | Queued PR conflicts: dequeue before pushing a resolution, or wait; never push first            |
| `57-merge-conflict-update-without-asking`      | `174`   | `--merge` run hits a conflict: update, resolve, and push without asking                        |

"apply" is `test-cases/snapshots/apply-review-session-refusal`, an
`apply review` output recorded by `test-cases/apply-review.test.mts` through
the REST mutation path. `38` replays its sibling, `apply-review-denied-reply`,
as the turn before fixture `140`. Both cases open with the same first REST
tick, fixture `143`.

`39` expects Δ≈0. The plugin has no `add_repo` guidance; the CLI output's own
instructions and the proxy's message carry the fix. A negative Δ may reflect a
missed pending-ID retry or another failed check. Inspect the individual grader
results before attributing it to the skill pulling the agent toward reading the
refusal as a review denial.

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
3. **Halting on a non-terminal action** (`MARK_READY`, `TRIAGE`). → `02`
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

Case `24` is coverage, not traffic: no transcript shows a missing `gh stack`
extension. It was added to test a rule then found only in the "Stack merge"
playbook; the stack merge step now prints that rule inline, so the case guards
the inlined clause.

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
  (see [Environment constraints](RUNNING.md#environment-constraints) and [NEXT-STEPS.md](NEXT-STEPS.md)). For scale, a shepherd tick is ~325 tokens at the median; a
  single `gh run view --log` routinely runs to tens of thousands.
- **Whether the CLI produces correct output.** That is covered by
  `test-cases/**` and the unit suite.
- **Target resolution itself.** Roughly a third of real invocations carry no PR
  identifier. Case `37-no-target-infers-branch` grades only the plan: invoke the
  CLI with no target instead of looking the PR up first. No case runs the CLI,
  so whether it resolves the right PR from the checkout is not executed or
  validated here; that is the CLI's own test suite.
