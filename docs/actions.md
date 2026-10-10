# shepherd actions

[← README](../README.md)

Each `pr-shepherd iterate` invocation returns exactly one action. The bare `pr-shepherd <PR>` command runs the bounded poll dispatcher and prints the final iterate action. The shipped skill instead uses `pr-shepherd [PR] --until-terminal`. See [iterate-flow.md](iterate-flow.md) for the decision order and [context.md](context.md) for what the header and body gather.

CLI `PR` accepts a positive number, `owner/repo#N`, or a GitHub pull-request URL. A qualified reference selects its repository for GitHub I/O; the current working directory remains the local git, configuration, classification-rule, and debug-log context. Multiple PR arguments select an exact same-repository set; `--stack PR` selects its complete native GitHub stack. Direct MCP calls still require qualified references, but they can name any accessible repository.

The default output format is Markdown — what the skill receives from its until-terminal poll dispatcher and what direct CLI users see. `--format=json` emits the same action data as a single JSON object for scripting. Every example below shows what the agent actually sees in the default (lean) format. MCP `iterate`'s `structuredContent` uses this same lean JSON shape (see [mcp.md](mcp.md)); MCP has no verbose equivalent.

The bare CLI command accepts `--interval`/`--timeout`/`--debounce`/`--quiet-status`/`--no-quiet-status` (e.g. `pr-shepherd <PR> --interval 60s --timeout 4.5m --quiet-status`), waits while the PR remains in `[WAIT]`, and returns on an agent-facing action. Polling defaults come from the `poll` configuration group; explicit flags override them. With `--merge`, it also continues through `MARK_READY` and returns `MERGE` when the ready-delay completes. Each ordinary `WAIT` tick writes a stderr line naming what it is waiting on (the `WAIT` log's check counts and reason) unless quiet status is enabled; the final action remains the only stdout result. If `--timeout` expires during WAIT polling, the bounded command returns that final `WAIT` result.

The shipped skill runs `pr-shepherd [PR] --until-terminal`.

- Ordinary `WAIT` and `MARK_READY` stay inside that poll.
- It returns `READY` while a clean ready-delay is counting.
- It returns `FIX_CODE` or stack-level `SHEPHERD` after `--debounce` (`poll.debounceSeconds`, default 1m, `0` disables), plus `MERGE`, a non-terminal quota warning, or terminal `CANCEL` / `ESCALATE`.
- A quota warning returns immediately. Follow its cadence and rerun without `--timeout`.
- After every other non-terminal result, follow `## Instructions` and run the same command again.
- `[READY]` is non-terminal. Rerun when `remainingSeconds` elapses. Do not invent unrelated work.
- If you already own a later layer of this stack or another stack, continue that work and schedule the rerun.
- A parent of more than one stack delegates that wait to the worker that owns the stack.
- Debounce ticks set `persistSeen: false`. Seen markers and first-look suppression wait for the post-window tick.
- `--quiet-status` keeps unchanged WAIT ticks out of agent context.
- MCP callers run one `iterate` tick at a time, with no debounce, and the host schedules the next call.

Explicit multi-PR and `--stack` selectors use a separate compact, read-only summary path. A CLI
aggregate returns when work is needed, every selected PR is complete, or its bounded timeout expires;
`--until-terminal` also returns a crossed quota warning with the same cadence instructions as
singular polling. Stack entries are fetched completely and ordered bottom-to-top. An explicit
multi-PR row keeps the rich fields in Markdown and JSON: repository, title/URL, raw
PR/merge/review/head/base/stack state, bounded check and review counts (including ignored and
superseded checks and active merge-queue commit checks), incomplete flags, and `pollCommand`.
A `--stack` row is an overview: shepherded or not, mergeable or one blocker, author, `owned` when
that author matches the authenticated viewer (REST reads the authenticated `/user` login without
inferring capabilities), position, and the layer's own base branch. REST rows include
`requiresMergeQueue` when branch policy proves a queue is required (`true`) or proves it is not
(`false`); an unavailable or incomplete negative policy remains omitted. Markdown renders the same
fact as `merge queue required` or `merge queue not required`. It omits
one-PR action tags, head SHAs, repeated stack coordinates, check and review histograms, and
`pollCommand`. Failing, in-progress, or actionable counts appear only for the blocker they explain.
A missing READY receipt is `not shepherded`, not a mergeability blocker. Markdown and JSON for a
stack are that same overview (`mode` stays `"summary"`). Aggregate API and MCP calls return one
summary tick without recurrence. The summary path never mutates GitHub, writes seen markers, or
maintains ready-delay state; one-PR sessions remain authoritative for those mutations and full
review context. Its only local state is a `--stack` selection's
[stall timer](escalations.md#stall-timeout).

For a native stack, `stackMergeable` is true only when every open layer is shepherded and mergeable
and every adjacent open boundary is linear. Shepherded means a current one-PR READY receipt. The
skill runs one-PR sessions only for rows marked `owned`. A draft is marked ready by its own session
as soon as that layer is clean; it does not wait for a lower layer's receipt. Review and CI
sessions for every owned layer that still has work are listed on the same tick. An unready stack
returns stack-level `SHEPHERD` with exact one-PR Shepherd commands and asks the caller to rerun the
same selector after those owned sessions. If every remaining session belongs to someone else, the
overview is the result: do not shepherd those layers.

A layer whose only failing checks are deferred on an open external pull request or issue is `WAIT`
(a probed row). The selector does not return `SHEPHERD` for that layer alone, so `--until-terminal`
keeps polling. A merged or closed blocker still sends the layer to its one-PR session, which says
to update the branch rather than rerun the job.

`CANCEL` is terminal only when every open layer is READY without merge intent (or every layer is merged). The stack heading then includes `[CANCEL]`; a human handoff heading includes `[ESCALATE]`. Those tokens are what the skill stops on. Aggregate mode
never performs mutations or emits rebase/push commands. `ESCALATE` is reserved for a human decision, such as a
closed-unmerged or otherwise unverified dependency, once no autonomous one-PR session remains.
If human blockers coexist with shepherdable layers, `SHEPHERD` is the immediate next action: its
instructions surface those blockers, route the autonomous layers, and require another stack
reconciliation. The stack returns `ESCALATE` for the remaining human handoff only after the
shepherdable layers have been handled. A closed
dependency and a stale-but-otherwise-ready child are first reprojected to effective `ESCALATE` and
`FIX_CODE` respectively at the row level, so an all-`CANCEL` stack truly has no remaining layer work.

When `--no-auto-mark-ready` or `actions.autoMarkReady: false` applies, each draft layer's
`pollCommand` is a bounded probe (`--timeout 1s --debounce 0s --no-auto-mark-ready`, flagged
`pollProbe: true`) that surfaces and routes review and CI work but never promotes the draft. A
probe whose row still has work is listed as a one-PR session. A clean draft becomes the agent's
ready-for-review step: run the probe first. Only when it returns `[WAIT]` held by the disabled
setting (the `auto-mark-ready-disabled` hold below) is the draft still clean, so the agent runs
`gh pr ready <N> -R <owner/repo>`; otherwise it completes the probe's instructions and leaves the
draft for the next round. Neither the poll loop nor a human performs that transition. Because the
agent does, such a draft escalates with `mark-ready-authorization-required` when its
`viewerCanUpdate` is not `true`, and it waits with `blocking-reviewer-in-progress` while a
configured blocking reviewer is pending. Rerunning a probe that can only report waiting — on CI,
merge state, or a blocking review — cannot change the stack. When no other agent work remains, the
selector returns `ESCALATE` for any human handoff, or otherwise `WAIT` with reason `waiting`, which
`--until-terminal` rechecks at its polling cadence and a bounded poll returns at timeout. Because
nothing reruns those probes, their own stall guards cannot fire, so the selector keeps a
stack-level timer: once that `WAIT` stays unchanged for the stall timeout, it returns `ESCALATE`
with `stall-timeout` naming each waiting layer
([`stall-timeout`](escalations.md#stall-timeout)). If that timer cannot be read or written, the
same tick returns `ESCALATE` with `stall-state-unavailable` and the filesystem error, so an
unwritable state directory cannot keep the idle wait polling
([`stall-state-unavailable`](escalations.md#stall-state-unavailable)).

When `--merge` is requested, the selector finds the highest open layer such that:

- That layer and every open layer below it have a current READY receipt.
- The bottom open layer targets the stack base.
- The prefix has no stale ancestry, queued layer, escalation, or closed-unmerged layer.

The lowest open layer is selected by native-stack order, even when GitHub still records its
merged parent's branch as its base, only after every preceding layer is verified `MERGED`.
A closed or unverified predecessor keeps the lookup fail-closed and cannot become a trunk
rebase target merely because the next layer is open. With a merged prefix, the retained base
does not prevent one-PR review or loading the stack trunk's required checks. Once the open layers
are ready, `--stack --merge` waits for
GitHub to retarget the lowest open layer onto the trunk before emitting a merge command; it
does not instruct the caller to edit a native-stack PR's base with `gh pr edit`.

READY-receipt certification uses the compact review sample independently of the full one-PR review
check. When the base branch requires conversation resolution and GitHub reports `CLEAN`, a
truncated sample does not prevent certification: GitHub confirms conversations no longer block
merging. The raw `review.incomplete` flag remains visible. Sampled actionable feedback, incomplete
CI, and blocked or unknown merge states still prevent certification; without required conversation
resolution, truncation alone is not a blocker. Queue membership alone does not waive completeness
when conversation resolution is required.
The optional-resolution exception requires a complete branch-rule page. A truncated review sample
also binds the receipt to the PR's `updatedAt`, so a later PR update invalidates it and routes the
layer back through its full one-PR poll before stack merging.

Merge command:

- The summary returns `MERGE` with a repository-qualified `gh stack merge` command in GraphQL mode, or the SHA-pinned `pr-shepherd apply merge` command in REST mode. Both name the ready prefix. REST queue requests omit the direct merge method because GitHub's queue controls it.
- REST uses the stack trunk's parsed branch policy, including when the highest ready layer targets its parent: `--merge-action merge_queue` for a known required queue, `direct_merge` with `--method` for known no-queue policy, or `default` without a method for unknown policy. A known queue rule remains authoritative when other policy is unavailable; a configured direct method with unknown queue policy escalates.
- The flag is `--squash` unless `merge.method` or the repository settings select another.
- When the command needs a direct merge method and no allowed method remains, the result is `ESCALATE` / `merge-method-unavailable` and there is no merge command. A REST queue request still proceeds when a configured direct method is disabled.
- REST stack commands include `--expected-stack '<JSON>'`, binding the stack number, trunk, and ordered lower prefix through the named PR. Each prefix entry binds its PR number, head branch and SHA, and target branch. Applying that command rejects missing membership or a changed stack, trunk, prefix, or parent boundary before submission, then rechecks current READY receipts and topology. Rerun the aggregate selector to obtain a fresh command after a stack change; do not remove its guard.
- `gh stack merge <PR>` lands that pull request and every unmerged pull request below it ([GitHub's stacked PR merge](https://github.github.com/gh-stack/introduction/overview/)).
- A direct merge is atomic. On a merge queue, the prefix is queued together and each layer is evaluated from the bottom. A failure ejects that layer and the layers above it. Layers that already merged stay merged.
- Layers above the prefix keep their one-PR sessions in the same instructions.
- `gh stack merge` reads a bare number as a stack number before a PR number. Native stack numbers come from the repository issue and pull request sequence (observed; GitHub does not document it), so a PR number never names a stack.
- If `gh stack` is an unknown command, the instructions install `github/gh-stack` first. The same step says not to rebase, push, or run `gh stack push`.
- After each merge, GitHub retargets the next layer. Rerun `--stack --merge` until every layer is merged and the result is `CANCEL`.
- If GitHub queues a layer, the summary stays `WAIT` for those queued layers. Recheck at the polling cadence. Do not rewrite a queued layer. That wait does not block a layer that is not queued. The stack is not finished until every layer merges.
- An ejected layer leaves the merge prefix until a receipt acknowledges that removal. The instruction names the reason and actor and says to run that layer's one-PR session, which fixes failing queue CI, records a validated acknowledgment for a transient or grouped-entry failure that does not reproduce after updating from the latest base, with no remaining blocker, or escalates when no autonomous path remains.
- An ejection stays actionable until a current one-PR READY receipt acknowledges that exact removal. Local timestamps are not proof.
- Close/reopen and draft/ready transitions invalidate older receipts even when the PR returns to the same commit.
- While a PR stays queued, an earlier queue entry advancing its target branch does not invalidate the receipt by itself. Shepherd still requires the same source head and review evidence, and checks the current merge-group state.
- A hard `CONFLICTING` or `DIRTY` state invalidates readiness even in the queue.
- A changed base branch name invalidates the receipt. Outside the queue, a changed base commit (`baseRefOid`) also invalidates it.
- Compact check annotation counts are part of the receipt. A late annotation on a completed check sends the layer back through its one-PR session.
- An explicit PR set that contains a native-stack member still routes that row to an authoritative one-PR poll and includes its `pollCommand`.

For a native stack, aggregate compares each open child's raw `baseRefOid` with the immediately lower
stack entry's `headRefOid` when both entries are open. GitHub can report both rows `CLEAN` and
`MERGEABLE` while those OIDs differ: the child was based on an earlier parent head and cannot carry
the parent's later work. The summary emits each mismatch in `stackAncestry` (JSON) / `## Stack
ancestry` (Markdown), including both PR numbers, ref names, and OIDs. The mismatch makes
`stackMergeable` false and routes the child through its one-PR Shepherd session; aggregate does not
prescribe the git repair. Aggregate JSON/MCP carries the raw ancestry rows, `stackMergeable`,
`nextAction`, and the same numbered instructions that Markdown renders. An all-terminal stack with
a closed layer is an `ESCALATE`, not a successful completion.

Command examples show the default `pr-shepherd` launcher. Every emitted follow-up command starts with the configured [`cliCommand`](configuration.md#clicommand--default-pr-shepherd) argv instead, such as `pnpm exec pr-shepherd`.

Pass `--verbose` to get more debug state. In JSON mode, the output starts from the full `IterateResult` shape (all fields, including `baseBranch`, `checks`, `shouldCancel`, and command-scoped `apiUsage`) and then applies the same instruction projection as lean JSON: non-`fix_code` actions get a top-level `instructions` array, and `fix.instructions` may be rewritten. In Markdown mode, `--verbose` restores the full header summary line and adds `## GitHub API usage`, including credential source labels, request counts, the latest authoritative quota state by resource, and exact measured GraphQL query cost. GraphQL mutations remain counted as unmeasured because GitHub exposes `rateLimit` only on the query root. Markdown and JSON use different representations but surface equivalent action information; MCP structured and Markdown content use the same projection options. Lean mode is the default because most fields are `false`/`0`/`[]` on a typical healthy tick and add context noise without value.

**Output shape (every action, default lean format):**

```
# PR #<N> [ACTION]

**status** `<…>` · **merge** `<…>`[ · **reviewDecision** `<…>`] · **state** `<…>` · **repo** `<…>`
**summary** <N> passing[, <N> skipped][, <N> filtered][, <N> inProgress][, <N> superseded][· **remainingSeconds** <N>][· **blockingBotReviewInProgress**][· **isDraft**][· **branch** behind PR base `<base>` | · **branch** conflicts with PR base `<base>` | · **branch** conflicts with stack trunk `<trunk>`]
Approvals: <None|N[/M]> [Required|Not Required]
Conversations Resolved: <Yes|No> [Required|Not Required]
[Merge queue: <No|position N STATE> [Required|Not Required]]
[Stack: <n> (layer <pos>/<size>, base <ref>)]
[other required-only merge-rule lines]
[**ignored** `<check-name>`, …]
[**superseded** `<check-name>`, …]
[**activity** <N> commits · <N> review rounds[ · <N> review items since latest commit][ · active: `<check>`, …]]
[**merge queue** enabled `<bool>` · inQueue `<bool>`[ · state `<state>` · position `<N>`][ · checkCommit `<oid>`][ · head updated after removal][ · removals on this head `<N>`][ · removal acknowledged]]
[**auto-merge** method `<method>` · enabledAtUnix `<unix>`[ · by `@<login>`]]
[**queue removal** reason `<reason>` · createdAtUnix `<unix>`[ · actor `@<login>`][ · commit `<oid>`][ · parents `<oid,...>`]]

<action-specific body>

[## GitHub API quota warning

- Resource: `<resource>`
- Remaining: <remaining>/<limit> [· used <used>]
- Crossed threshold: <percent>% remaining
- Reset: <time>
- Recommended poll interval: <minutes> minutes
- Recommended bounded CLI timeout: <minutes> minutes
- Recommendation: keep polling pr-shepherd at the cadence above; for incidental PR reads use explicit REST endpoints such as `gh api repos/OWNER/REPO/pulls/PR`; do not substitute `gh pr checks`/`gh pr watch`]

[## Classification auto-resolve

<one-line summary>[ (rule: <reason>)]
[- <url or `id`>]
[- <id>: <error> [(rule: <reason>)] ]]

## Instructions

1. <numbered steps telling the agent exactly what to do>
```

`apiUsage` keeps raw telemetry for every pool used during the command, including GraphQL attempts before an automatic switch to REST. Warning selection and poll cadence use the active pool: REST mode uses REST core only; GraphQL mode considers both GraphQL and REST core budgets. Pending REST core warnings stay active through the poll loop; GraphQL warnings are discarded after a switch to REST.

Lean-mode rules for the summary line:

- Zero counts (`skipped`, `filtered`, `inProgress`, `superseded`) are omitted.
- `remainingSeconds` is shown only when the ready-delay timer is actively counting down (`status === "READY"` and `remainingSeconds > 0`).
- `blockingBotReviewInProgress` and `isDraft` are shown only when `true`.
- `shouldCancel` is never shown (it is fully implied by `action === "cancel"`).

**`ignored` line** (Markdown and JSON `ignoredNames`), only when a check matched `ignoreChecks`:

- Lists the suppressed check names.
- Those checks do not affect the CI verdict, the `inProgress` count, or stall detection.
- If `mergeStateStatus` is `UNSTABLE` and every non-ignored check passed, the PR is `READY`, same as `BLOCKED` with passing CI.
- An ignored check's pending or failing state does not drive stall-timeout escalation.

**`superseded` line** (Markdown and JSON `supersededNames`), only when a `CANCELLED` check has newer-run evidence in the same loaded commit context:

- This is concurrency-group eviction from a new push or a second trigger of the same push.
- The evidence is either a strictly greater run ID from the same workflow, event, scope, and commit, or an exact-name `SUCCESS` check with a distinct lower numeric run ID and the same workflow ID, event, scope, and commit whose valid positive start and completion timestamps are both strictly later (with completion at or after start). The timestamp form establishes observed ordering only; it does not prove that both triggers used an identical PR base.
- These checks do not affect `anyFailing` or `allPassed` and never appear under `## Failing checks`.
- No action is needed for the local Shepherd verdict. GitHub's status rollup remains unchanged; its branch protection evaluates the checks it received.
- A `CANCELLED` check without either matching form of newer-run evidence is not superseded. It stays under `## Failing checks` with `[conclusion: CANCELLED]`.

- `**branch**` is appended to `**summary**` when `mergeStatus` is `BEHIND` or `CONFLICTS`, so the agent can decide on a rebase without another fetch.
- `**reviewDecision**` is appended to the status line when the derived merge status is `BLOCKED`.
- After a sweep, iterate always prints `Approvals:` and `Conversations Resolved:` (current vs required).
- Extra merge-rule lines appear only when they apply: code-owner review, last-push approval, signed commits, linear history, branch up to date, required status checks, deployments, workflows, code scanning, merge queue, GitHub stacks.
- A test result with no `mergeRequirements` still gets a fallback `**required**` line from `requiredStatusCheckContexts`. Live iterate uses `mergeRequirements` and omits that line.
- Read Approvals and Conversations Resolved instead of inferring a required review from `reviewDecision`. `REVIEW_REQUIRED` with `Approvals: None [Not Required]` means GitHub is not waiting on an approval.
- `--verbose` restores all five counts, `remainingSeconds`, `blockingBotReviewInProgress`, `isDraft`, and `shouldCancel`.
- Lean JSON always emits raw `mergeStateStatus`, plus derived `mergeStatus` when it is not `CLEAN`. `mergeStateStatus` alone cannot rebuild `mergeStatus` (a conflicting `mergeable` value can be `CONFLICTS` while `mergeStateStatus` says something else).
- `--verbose` JSON returns the full `IterateResult`, including `mergeStatus: "CLEAN"`.

Load-bearing conventions (the iterate skill depends on these):

- Headings:
  - One PR: `# PR #<N> [<ACTION>]`.
  - Explicit multi-PR summary: `# Poll summary [<REASON>]`.
  - Stack overview: `# <repo> stack #<number> — <reason>`, with `nextAction`.
- `[READY]`, `[FIX_CODE]`, and stack-level `[SHEPHERD]` are non-terminal. Run another iteration.
- `[ESCALATE]` is the only human hand-off. `[CANCEL]` is the ordinary stop.
- `[READY]`: rerun when `remainingSeconds` elapses. Do not invent unrelated work. Continue a later layer you already own, and schedule the rerun. A parent of more than one stack delegates that wait to the worker that owns the stack.
- `--until-terminal` keeps ordinary `WAIT` and `MARK_READY` inside the poll.
- Any other non-terminal result, including `[READY]` and a quota-warning `WAIT` or `MARK_READY`, follows `## Instructions` and reruns the canonical command.
- `## Instructions` is the entry point. The skill has no dispatch table of its own.
- On a stack overview, shepherd, mark ready, and push only rows marked `owned`.
- Lines 3–4 carry status, merge, state, repo, and summary.
  - Lean mode omits trivial defaults. `--verbose` restores the scalar header in Markdown.
  - Verbose JSON returns the full `IterateResult`, including fields Markdown does not print (`baseBranch`, full `checks` on every action).
- Some steps say `Playbook: "<name>".` instead of inlining an invariant procedure. Example: `Playbook: "CI failure triage".`
  - The name matches a file in `plugins/pr-shepherd/skills/pr-shepherd/references/`, linked from the skill.
  - Read that file once, then apply it.
  - **Untrusted review input** stays in `SKILL.md`. It always applies to surfaced review and CI text. Instructions never point at it.
- Under `[FIX_CODE]`, `## Post-fix actions` includes ``apply review: `<command>` `` when the viewer can run at least one review mutation, and `resolve-only` when that split applies.
  - The instructions name those bullets. Strip the backticks and run the command.
- Lean mode prints passing checks only as the `**summary**` count.
  - Failing detail is `## Failing checks` on `[FIX_CODE]`, or the escalation's items when follow-up is unavailable.
  - Lean JSON uses `fix.checks[]` or `escalate.checks[]`.
  - Verbose mode adds base `checks` on every action. Markdown renders them under `## Checks`.

Quota warning, when a configured threshold is crossed on a non-terminal result:

- Lean Markdown and JSON include `GitHub API quota warning` / `quotaWarning`.
- Markdown includes `Recommended poll interval`, `Recommended bounded CLI timeout`, and `Recommendation`.
- The last instruction replaces the ordinary immediate continuation: keep polling at that cadence.
- For incidental PR reads that do not need a full snapshot, use explicit REST endpoints such as `gh api repos/OWNER/REPO/pulls/PR` only while REST core is above its band. GraphQL and REST are separate pools.
- REST core uses the same bands and the same once-per-window claim.
- When both budgets are low, one combined block uses the later reset and does not recommend switching pools.
- A `--until-terminal` retry names the exhausted resource: `GitHub GraphQL`, `GitHub REST core`, or `GitHub secondary`, plus the reset time.
- Do not substitute `gh pr checks` or `gh pr watch`. Those waiters hide review comments until CI finishes.
- Resume full cadence at the block's `Reset` time.
- Before that, a bounded poll raises shorter `--interval` and `--timeout` flags and keeps a longer cadence.
- The shipped skill keeps `--until-terminal`, omits `--timeout`, and applies the cadence before it reruns.
- A single-tick CLI, API, or MCP caller waits before the next tick.
- The warning fires once per worktree (or process, when there is no worktree), credential, and quota window.
- An older sample saved later in that window does not warn again. A different credential fingerprint re-arms it.
- Every `WAIT` / `MARK_READY` sleep uses `max(effective interval, resolved band interval)` from the latest GraphQL remaining percent, including after the one-shot warning.
- An unbounded `--until-terminal` poll still returns the first warning so the skill can slow down and rerun with `--interval`.
- Single-tick `iterate` / MCP do not sleep.
- Terminal `cancel` and `escalate` do not warn. `[FIX_CODE]` and stack-level `[SHEPHERD]` still can, because they are non-terminal.
- Usage, cost, and fingerprint skip: [graphql.md](graphql.md).

`--until-terminal` rate-limit retry:

- The first retry landing on the reset instant does not exit 75.
- An exhausted primary limit sleeps until `resetAt`, plus 5 seconds, plus `resetAt % 5` seconds.
- A later `resetAt` starts that wait over.
- An unchanged or missing `resetAt` backs off 15s, then 30s, then 60s.
- The fifth no-progress attempt writes one stderr line naming the resource and reset time, then exits 75.
- A sleep longer than `--interval` is split into interval chunks.
- Between chunks, when the exhausted resource is not REST core, one REST `GET /repos/{owner}/{repo}/pulls/{n}` checks for a merge or close.
- A merged or closed PR returns the same `CANCEL` as a merged or closed iterate tick.
- `--stack` and multi-PR polls return all-terminal `CANCEL` only when every tracked layer is merged or closed. A partial merge keeps sleeping.
- A REST core limit on that check skips further probes until the sleep ends.
- Bounded polls still fail with 75 on the first rate-limit error.

---

## Event mode

With `--poll-mode event` (or `poll.mode: event`, or `auto` under `CLAUDE_CODE_REMOTE=true`) Shepherd runs one tick and never sleeps. The action, exit code, and every section below are unchanged. Two additions apply; see [cloud.md](cloud.md) for the full contract.

- **`pollMode`** is `"event"`. The text header repeats it as `**pollMode** \`event\``. It is omitted in poll mode.
- **`nextCheck`** is `{ at, inSeconds, reason }`, printed as a `**nextCheck**` header line after `**activity**`. `reason` is `ready-delay`, `stall-timeout` (the unchanged-state stall timer, or on `wait` the time the oldest unstarted check's age reaches the CI-start stall timeout), `merge-queue`, `merge-pending` (a printed REST or stack merge that can stay `pending`; about five minutes), or `safety-net` (a backstop for a missed PR event). It is omitted for `cancel`, `escalate`, a `merge` whose command is not a REST merge, `mark_ready`, a native-stack draft hold, and an aggregate that is all terminal or whose rows are all `cancel` or `escalate`.

Instruction changes when `nextCheck` is present:

- `ready` and `wait` replace "iterate immediately" or "rerun when the timer elapses" with two steps: end the turn without sleeping (`Playbook: "Cloud event loop".`), then keep exactly one wake-up at `nextCheck.at` and rerun the same command on a PR event or that wake-up, acting only on Shepherd's output. A safety-net wake-up is named `safety-net wake-up`. The quota-aware polling-cadence sentence is not printed in event mode, since Shepherd is not polling; the quota warning itself still prints. A native-stack draft hold has no `nextCheck` and does not get these two steps; it uses the event-mode hold instructions below.
- A REST `merge` prints the merge command step without the polling-cadence sentence, then the same two event steps with a `merge-pending` wake-up; the rerun reprints the command, which resumes a pending request.
- `mark_ready` has no `nextCheck` and always prints the plain instruction to iterate immediately, without the quota-aware cadence sentence: the tick saw a draft, so only the next tick can start the ready-delay timer and schedule its deadline.
- `fix_code` replaces its last step (`FIX_CODE_CONTINUATION`, or its quota-aware variant) with: rerun once after the fixes, then end the turn, keeping one wake-up at `nextCheck.at`.
- In durable-state sessions (event mode or `CLAUDE_CODE_REMOTE=true`), a generated `apply review` command that replies carries `--adopt-existing-replies`, so rerunning it after a lost state directory adopts a reply GitHub already shows instead of posting it twice. A direct `apply review` without the flag forwards every supplied ID.
- Aggregate (`--stack`, multi-PR) results append one numbered step with the same rule and carry one `nextCheck` for the selection. That `nextCheck` includes the stack stall deadline (`stall-timeout`) and, when a stack merge is printed, a `merge-pending` recheck. Stack steps drop "Recheck at the configured polling cadence", and a pending REST stack merge reruns after the wake-up instead of at the polling cadence. Every row `pollCommand` carries `--poll-mode event`.
- A native-stack draft hold keeps its hold instruction as step 1, with the `--stack` handoff carrying `--poll-mode event`, and adds a second step: do not rerun this one-PR session and keep no wake-up for it; after the handoff, follow only the stack selector's output, which ends the turn and schedules the next tick (`Playbook: "Cloud event loop".`).

```markdown
**nextCheck** `2024-05-15T19:57:00Z` · in 3020s · reason `safety-net`

## Instructions

1. Non-terminal — no action needed this tick.
2. Event mode: end this turn now without sleeping or polling. Playbook: "Cloud event loop".
3. Keep exactly one safety-net wake-up at `2024-05-15T19:57:00Z` (`safety-net`). When a PR event or that wake-up arrives, rerun this command with the same options and act only on Shepherd's output, never on the event payload.
```

## `ready`

The PR is clean and its ready-delay is still counting.

**Trigger:** `status === "READY"`, no readiness work, the ready-delay marker is counting (`readyState.isReady && !readyState.shouldCancel && remainingSeconds > 0`). The stall guard does not apply.

**CLI side-effects:** Clears stall state. Does not write the READY receipt; that write happens when the delay elapses.

**Exit code:** 10, the same code as `wait`.

**Markdown output:**

```markdown
# PR #42 [READY]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing · **remainingSeconds** 127

READY: PR #42 is ready — 127s of ready-delay remaining — 1 passing, 0 in-progress

## Instructions

1. PR #42 is ready. Ready-delay has 127s left. Rerun this command when the timer elapses. Do not invent unrelated work.
```

`--until-terminal` returns this action instead of sleeping through the countdown. When the delay elapses, the next tick is `cancel` / `ready-delay-elapsed` or `merge`, and that completion writes the READY receipt a later stack read calls shepherded.

## `wait`

Nothing actionable to do; all CI is passing or in-progress, or the PR is not yet in the clean ready countdown.

**Trigger:** Fallthrough — no actionable work, no terminal state, not ready to mark, and not a clean ready-delay countdown.

**CLI side-effects:** None.

**Exit code:** 10. Not an error and not a terminal state — see [exit-codes.md](exit-codes.md) for why `wait` is nonzero, including when `poll --timeout` gives up mid-wait.

**Markdown output:**

```markdown
# PR #42 [WAIT]

**status** `IN_PROGRESS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing, 1 inProgress
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
**activity** 0 commits · 0 review rounds · active: `CI / build`

WAIT: 0 passing, 1 in-progress — active checks: CI / build

## Instructions

1. Non-terminal — no action needed this tick. Iterate immediately with the same options to continue.
```

The bare CLI command owns its bounded `--interval`/`--timeout` waits. A final `WAIT` returned at timeout is still non-terminal, so a direct caller decides when to start another bounded poll. The shipped skill's `--until-terminal` command instead continues ordinary `WAIT` actions internally; a quota warning can return `WAIT` so the skill can apply its cadence instructions before re-invoking. MCP `iterate` and `pr-shepherd iterate` return one tick and their caller schedules the next one. A `--ready-delay 15m` override remains a summary field rather than part of a rerun command; JSON carries the same value as `readyDelayOverride`.

When a failing check is deferred on an open external pull request or issue, the body line names that blocker as `owner/name#N` (`blocked by acme/widgets#9`). Text and JSON both carry that log. `--until-terminal` keeps polling at its normal cadence instead of returning `FIX_CODE` for that check alone.

The body line (`WAIT: …`) varies with the merge state — `branch is behind base`, unmet merge requirements (approvals, conversations, merge queue, …), `PR is a draft`, or `some checks are unstable`. After a sweep, iterate also prints current-vs-required merge rules so the agent can see _why_ GitHub is not mergeable (for example `Approvals: None [Not Required]` vs `Approvals: None [Required]`). Merge-queue and GitHub-stack membership appear as extra lines when they apply (`Merge queue: position 2 QUEUED [Required]`, `Stack: 7 (layer 2/3, base main)`); they are omitted when the PR is not in a queue or stack and merge queue is not required.

**Deferred work while queued** (`--merge` and `mergeQueue.inQueue`):

- Review threads, PR comments, `CHANGES_REQUESTED` reviews, and review summaries do not trigger `fix_code`. A push now would eject the PR.
- The tick is `WAIT`. Raw counts are `deferredWork` in JSON and `**deferred (in merge queue)**` in Markdown. Omit the line when nothing is deferred.
- Failing checks, including `merge_group` failures on the queue commit, unseen check annotations, and merge conflicts are never deferred. They still go to `fix_code`.
- [`actions.workWhileQueued: true`](configuration.md#actionsworkwhilequeued--default-false) acts on that work immediately.
- After the PR leaves the queue, the next tick picks the work up. Held items are not marked seen, so nothing is dropped. See the comment visibility invariant in [`AGENTS.md`](../AGENTS.md).

**Disabled mark-ready on a native stack draft:** a draft native stack layer whose session will not mark it ready carries `stackDraftHold` in JSON:

- `{ "kind": "auto-mark-ready-disabled" }` — the session or configuration disables automatic mark-ready, as in the stack selector's bounded draft probes. This `READY` hold confirms the `--stack` selector's ready-for-review step for the agent.

A clean draft is marked ready by its own session even when lower layers are still in progress. Repeating the disabled-hold session cannot mark the draft ready, so the single instruction replaces "iterate immediately" with a stack handoff (quota cadence advice is appended when a warning applies). The hold keeps the ordinary poll loop and stall guard.

```markdown
1. PR #42 stays in draft because automatic mark-ready is disabled for this session, so repeating this one-PR session cannot advance it. If a `--stack` selector listed this session, finish that selector's remaining steps and rerun it with its original flags; otherwise run `pr-shepherd --stack https://github.com/owner/repo/pull/42 --until-terminal`, adding `--merge` when merging was requested.
```

**What the skill does:** Ordinary `WAIT` actions remain inside its `--until-terminal` poll. If a quota-warning `WAIT` is returned, follow `## Instructions`, adjust cadence, and re-invoke the canonical command. Direct MCP/`iterate` callers must reschedule themselves.

---

## `mark_ready`

Converts a draft PR to ready for review.

**Trigger:** All of: `status === "READY"`, `isDraft === true`, `!blockingBotReviewInProgress`, `config.actions.autoMarkReady` is enabled (disable with `--no-auto-mark-ready`), and ready-delay not elapsed (`readyState.shouldCancel === false`). Once the delay elapses, the action flips to `merge` with `--merge`, otherwise `cancel`. There is no extra `mergeStateStatus === "CLEAN"` check.

**CLI side-effects:** Calls the selected transport's mark-ready operation when it is otherwise eligible. GraphQL remains fail-closed unless `viewerCanUpdate: true`; a false or unavailable GraphQL capability does not attempt the mutation. REST omits viewer capabilities, so on the supported cloud CCR route Shepherd attempts mark-ready and lets GitHub's response decide. An actual denial returns `authorization-required` with action `mark-ready`; an unavailable route returns `transport-unsupported`.

**Exit code:** 11

**Markdown output:**

```markdown
# PR #42 [MARK_READY]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing · **remainingSeconds** 300 · **isDraft**
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

MARKED READY: PR #42 converted from draft to ready for review

## Instructions

1. The CLI marked the PR ready for review. Iterate immediately with the same options to continue.
```

**What the skill does:** Ordinary `MARK_READY` actions remain inside its `--until-terminal` poll. If a quota-warning `MARK_READY` is returned, follow `## Instructions`, adjust cadence, and re-invoke the canonical command. Direct MCP/`iterate` callers must reschedule themselves.

---

## `merge`

Emits an exact GitHub CLI command; Shepherd does not execute or wrap the merge operation.

**Trigger:** `--merge` is enabled and the clean READY state has lasted for the configured ready-delay. `--ready-delay 0` emits it immediately.

**Command modes:** Explicit merge intent is not gated by `viewerCanEnableAutoMerge`. With GraphQL, an ordinary branch emits a head-pinned `gh pr merge <PR> --repo <owner/repo> --match-head-commit <head> --auto ...commandArgs` plus a plain-merge fallback command; a queue-required or queue-enabled branch (`mergeRequirements.mergeQueue.required` or `.enabled`) emits a head-pinned queue command (`mode: "queue"`) plus a `queueApiFallbackCommand` for the known gh CLI queue limitation. With REST, Shepherd emits one head-pinned `pr-shepherd apply merge <PR URL> --require-sha <head> --merge-action <action> --transport rest` command. `<action>` is `merge_queue` when queue use is known, `direct_merge` when direct merge is known, or `default` when REST cannot determine queue policy. `--method` is included only for a known direct merge and a repository-allowed method. REST merge is asynchronous: `pending` and `enqueued` are not merged states. Rerun the same printed command to resume its persisted UUID; it checks the existing request rather than submitting a duplicate. GitHub remains authoritative for permission, branch-policy, and execution results.

`merge.commandArgs` applies only to GraphQL-mode ordinary commands. `merge.method` applies to GraphQL direct commands and REST `direct_merge` requests. The method is one of `merge`, `squash`, or `rebase`, and the repository must allow it. When none is configured, Shepherd selects an allowed method in the order merge, squash, rebase. A direct request with a configured method the repository disables, or every method disabled, returns `ESCALATE` with trigger `merge-method-unavailable`. REST `merge_queue` requests do not validate or send that unused method. When REST cannot read the queue policy, it uses `default` without a method unless a configured method would make that request unsafe; then it escalates until policy is known. Every emitted command pins the expected PR head. Complete ruleset evidence plus an explicit classic-protection `Branch not protected` response proves the absence of a queue rule. Generic protection 403/404 responses leave that policy unknown; a successful classic-protection read also cannot exclude a classic queue because REST omits that setting. A positive ruleset queue requirement remains authoritative in all these cases.

**Native stacks:** When GitHub's batch query reports the PR is part of a native stack, Shepherd builds neither ordinary command mode above, for any stack position including position 1. `--auto` is rejected server-side on stacked PRs, and the plain-merge fallback would land a mid-stack PR into its still-unmerged parent branch instead of the stack's trunk ref. After persisting its fresh READY receipt, the one-PR poll returns non-terminal `FIX_CODE` with `pr-shepherd --stack <PR URL> --until-terminal --merge`. That selector reconciles each layer's READY receipt and linear ancestry and returns `MERGE` for the highest open layer whose open lower layers are all ready; it then rechecks until every layer merges and returns `CANCEL`. If the fresh snapshot or receipt cannot be persisted, the one-PR poll returns `WAIT` and does not claim the stack is ready.

**Exit code:** 15.

**Markdown output:**

```markdown
# PR #42 [MERGE]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Merge command

- auto-merge: `gh pr merge 42 --repo owner/repo --match-head-commit abc123 --auto --merge`
- plain merge fallback: `gh pr merge 42 --repo owner/repo --match-head-commit abc123 --merge`

## Instructions

1. Run the `auto-merge` command shown above exactly as printed.
2. Only if GitHub reports that auto-merge is unavailable, run the `plain merge fallback` command shown above.
3. Then iterate immediately with the same options to monitor until the PR merges or needs work.
```

A queue-required or queue-enabled branch instead emits the selected transport's queue command and any transport-specific fallback supported by the current interface. Queue enqueue is not assumed to be GraphQL-only; the instruction carries the applicable command and operation details.

```markdown
## Merge command

- merge queue: `gh pr merge 42 --repo owner/repo --match-head-commit abc123`
- queue API fallback: the transport-specific, head-pinned enqueue operation printed by Shepherd.
```

REST output uses a single command rather than the two GraphQL-mode variants:

```markdown
## Merge command

- REST merge: `pr-shepherd apply merge https://github.com/owner/repo/pull/42 --require-sha 0123456789abcdef0123456789abcdef01234567 --merge-action direct_merge --method squash --transport rest`

## Instructions

1. Run the `REST merge` command shown above exactly as printed.
2. If its status is `pending`, rerun that same command at the configured polling cadence to resume the recorded request. An `enqueued` result means GitHub accepted the queue request; it does not mean the PR merged.
3. Iterate again to confirm the final PR state.
```

The REST command prints a result with `status` set to `pending`, `enqueued`, `merged`, or `failed`. It may include `details.uuid`, `details.expected_head_sha`, `details.merge_action`, `details.merge_method`, `details.bypass_rules`, or the merged `details.sha`. A pending UUID and request options are persisted locally. If the request outcome is uncertain or the UUID expires, Shepherd does not submit a duplicate; reconcile the PR state before starting another request.

A definite failed request can be replaced when the requested options change. A recorded `enqueued` request can also be replaced after a fix or rebase changes the head, provided a fresh PR read matches the new `--require-sha`; its old SHA guard cannot merge the new head. Pending or uncertain requests, and enqueued requests with the same head, remain protected from replacement. An interrupted local replacement can resume its persisted intent before submission; once submission may have started, retries never send a duplicate. Native-stack replacements still require fresh READY receipts for the complete open prefix. The expected-stack guard is persisted with request options; dropping or changing it cannot resume a pending or uncertain request as a standalone merge.

After the caller runs an emitted auto-merge or queue command (or its fallback), iteration continues. An active auto-merge request or queue entry emits `WAIT` without ready-delay cancellation or generic stall escalation. Synthetic queue-commit `merge_group` failures emit `FIX_CODE` with their run/log context. With `--merge` in GraphQL mode, a removed entry with raw reason `failed_checks` whose failed check matches the current removal commit also emits a SHA-matched `requeue` plan, while native stacks emit an exact removal acknowledgment command and retain their aggregate merge route. If otherwise eligible same-head recovery or native-stack removal acknowledgment reaches REST mode, the result keeps the failed-check work and prints an explicit `transport-unsupported` instruction: REST cannot verify the current removal history, so neither command is emitted. Active entries, updated heads, mismatched removal commits, and manual, missing, or unknown removal reasons get neither recovery plan. Queue check contexts are fully paginated. A queue removal without an actionable failure emits `ESCALATE` with GitHub's raw reason, actor, time, queue commit, and parent commit IDs. Squash and rebase queue commits have one parent and still count as the current removal until a later push of the head (the earliest pull_request check time on that commit, or the head's committer time when no check time is available); see [`merge-queue-removed`](escalations.md#merge-queue-removed).

REST retains an available `auto_merge` request as `mergeQueue.autoMergeRequest`, including `mergeMethod` and `enabledBy` when known. Its unavailable `enabledAtUnix` timestamp is omitted in JSON and Markdown. The aggregate merge-enabled route also waits with reason `already-auto-merging`.

---

## `cancel`

Stops polling this pull request — no further iterations for this PR are needed. Continue any remaining pull requests or issues from the original request.

**Trigger:** Either the PR is merged or closed (`state !== "OPEN"`), or `--merge` is not enabled and the ready-delay timer elapsed after the current sweep still verifies the PR as a READY state. Candidate READY reports get a fresh mergeability read before the timer can complete, so newly detected conflicts route to `fix_code` instead of `cancel`.

**CLI side-effects:** Deletes the `ready-since.txt` marker and READY receipt when the PR is merged/closed, and consumes the elapsed marker when ready-delay elapses. Before an open PR completes its ready-delay, a fresh compact summary must still confirm READY, non-draft status, a mergeable state, current head/base OIDs, and no actionable review or CI before Shepherd persists its READY receipt; the base OID on both sides is the base commit GitHub recorded for the PR, not the base branch's live tip. A later tick invalidates the receipt when that evidence changes; while it stays current, re-polling the PR — for example rerunning with `--merge` after a `ready-delay-elapsed` cancel — completes its ready-delay immediately instead of restarting it. A PR whose fresh summary is not yet mergeable (for example `BLOCKED` on a required review) gets no receipt, so a rerun waits the full delay again. Outside a native stack the receipt only lets a rerun skip the wait, so an unreadable snapshot or failed write still returns `CANCEL`. On a native-stack layer, an unreadable snapshot or failed receipt write remains `WAIT` with `remainingSeconds` 0 and keeps the elapsed marker, so the next tick retries the receipt instead of restarting the ready-delay; the marker is deleted once the receipt is written. A receipt that keeps failing reaches the [stall timeout](escalations.md#stall-timeout). Aggregate `--stack` uses these receipts but never creates them.

**Exit code:** 0 for `reason: "merged"` or `reason: "ready-delay-elapsed"` — these are shepherd's two "finished cleanly" outcomes. 14 for `reason: "closed"` (closed without merging). See [exit-codes.md](exit-codes.md).

**`reason` field:** The result carries a structured `reason` discriminator — `"merged"`, `"closed"`, or `"ready-delay-elapsed"` — as a first-class field in both JSON and Markdown output. JSON consumers should branch on `reason` rather than parsing `log`.

**Markdown output:**

```markdown
# PR #42 [CANCEL] — merged

## Instructions

1. Stop polling this pull request — its poll is complete.
2. Continue any remaining pull requests or issues from the original request.
```

Merged and closed PRs are terminal, so their default output is only the heading and `## Instructions`; no status, check, review, or merge-requirement data can change the next step. The lean JSON matches it: `{ "action": "cancel", "pr": 42, "reason": "merged", "instructions": [...] }` (plus `ruleAutoResolve` when that ran). `--verbose` keeps the full header, status lines, and `CANCEL: PR #42 is merged — stopping` / `CANCEL: PR #42 is closed — stopping` log line.

A `ready-delay-elapsed` cancel (`# PR #42 [CANCEL] — ready-delay-elapsed`) keeps the full header and its body line: `CANCEL: PR #42 has been ready for review — ready-delay elapsed, stopping`. When merge is still `BLOCKED` after the delay, the body uses a specific unmet-requirement note when one is known (`awaiting 1 approval`, `in merge queue position 2`, …) and otherwise `is awaiting human review or branch protection resolution` — it does not guess from `reviewDecision` alone.

A `ready-delay-elapsed` cancel carries the same `**merge queue** …` header line (raw enabled/inQueue/entry/removal fields, see the header block above) as every other action when `mergeQueue` is present, matching JSON output.

**What the skill does:** Follow `## Instructions` — stop polling this pull request and continue any remaining work from the original request.

---

## `fix_code`

Actionable work exists — whether it requires code edits or only resolution is up to the agent.

**Trigger.** Any of:

- Unresolved inline review threads, or resolution-only inline threads.
- Actionable PR-level comments.
- `CHANGES_REQUESTED` reviews.
- A failing CI check with autonomous follow-up.
- A later-attempt workflow failure while the branch is behind its PR base.
- Required status contexts with no check run and no status context, while no Actions workflow is running.
- Unseen check-run annotations on non-passing checks.
- Merge conflicts (`mergeStatus.status === "CONFLICTS"`).
- A verified stale native-stack boundary for this PR.
- Pending first-look review summary IDs to minimize.

Stale boundary and native-stack conflicts:

- The stale-boundary path returns the observed parent and child OIDs and a one-PR repair, then the ordinary `FIX_CODE` continuation. Aggregate `--stack` never does that repair.
- In GraphQL mode, a native-stack conflict uses a gh-stack rebase from a clean checkout. REST-mode instructions use the repository's stack-update procedure rather than gh-stack API commands.
- GraphQL mode imports with `gh stack checkout <stack number>` when `gh stack` does not track the stack locally. Use the stack number, not the PR number.
- The step points at the Branch update playbook for the head check and `gh stack rebase --continue` in GraphQL mode. The `gh stack merge` step prints its own missing-extension and no-push rules inline.
- In GraphQL mode, an upper layer behind its parent gets `gh stack rebase --upstack --no-trunk` from that parent, not from the stack trunk.
- A whole-stack rebase starts at the lowest open layer by stack order when the upper layer already contains its parent (summary: `conflicts with stack trunk`, JSON: `stackTrunkConflict`) or when this is the lowest open layer. The latter includes a higher-position layer whose lower layers are all verified `MERGED`, even if GitHub has not yet retargeted its recorded PR base onto the trunk. An unavailable bottom PR number is described as the stack's bottom open layer, without requiring its base branch to name the trunk. A known closed or unverified lower layer cannot supply that fallback.
- Publish the rewritten stack with the repository's stack-update procedure in REST mode and `gh stack push` in GraphQL mode, not a push of the PR head alone.
- A conflicting head with a complete empty check-suite page and no check runs says GitHub did not start `pull_request` workflows after Shepherd has seen that head for 2 minutes. Commit time is not used. An unreadable seen marker omits the note. Pushing that same head again does not start them.
- Failing checks of every type enter check handling. Use the included failed step, summary, and bounded log excerpt.
- When no nonblank log excerpt is included, or the check is `CANCELLED` or `STARTUP_FAILURE`, Shepherd adds `[rerun authorized]` and a `rerun:` command when all of the following hold:

- the viewer's repository role grants Actions rerun capability (`repositoryPermission` is `WRITE`/`MAINTAIN`/`ADMIN` — this confirms the account's role, not the granular scope of whatever credential actually executes `gh`; an unauthorized rerun simply fails when run, the same residual risk as any other CLI-recommended git/gh mutation);
- GitHub reports `run_attempt === 1`; later attempts have consumed Shepherd's single rerun allowance, and unavailable attempt metadata is denied conservatively;
- the check's scope is not `merge_group` (rerunning queue CI cannot restore a removed queue entry and overwrites the failure evidence);
- the check's `runId` is confirmed to identify a GitHub Actions run — either fetched directly from the Actions REST API (a `STARTUP_FAILURE` check) or carrying a resolved `workflowName` (any other check) — rather than a coincidental number parsed from some other CI system's details URL;
- its conclusion is not `ACTION_REQUIRED` (the run is paused pending manual workflow approval, which a rerun cannot grant); and
- its run is not still in progress (a sibling job from the same run present in `report.checks.inProgress` — GitHub can only rerun a completed run).

A failing check recorded as blocked on an open external pull request or issue does not by itself return `[FIX_CODE]`, does not carry a `rerun:` command, and does not count toward fix-attempt or fix-thrash. If it was the only `[FIX_CODE]` cause, Shepherd returns `[WAIT]` and the log names the blocker (`owner/name#N`). Other `[FIX_CODE]` causes on the same tick still return `[FIX_CODE]`, with that check omitted from `## Failing checks` and from rerun commands. Once the blocker is merged or closed, the check stays actionable while the branch is `BEHIND`, conflicting, or `UNKNOWN`: `## Instructions` includes a numbered step to update this PR branch from its base, for example `gh pr update-branch <pr> --rebase`, and tells the agent not to rerun the job. When the branch is already current, Shepherd deletes that record so a later failure of the same check is an ordinary failure again. A released record whose check is no longer failing is ignored.

External checks and later attempts:

- An external check has no run id, so it never gets a rerun. It is not a GitHub Actions run.
- A non-empty `detailsUrl` is still an investigation path. The check stays `[FIX_CODE]`: inspect the provider or reproduce it locally, apply a warranted fix, and iterate.
- A later attempt (`runAttempt > 1`) stays `[FIX_CODE]` when the log excerpt is nonblank, or when the branch is behind or conflicting. Inspect the PR base for an existing fix, update from that base, push, and iterate. It never gets another rerun.
- `[ESCALATE]` / `check-follow-up-unavailable` happens only when every remaining failing check needs a human, or has no usable evidence, rerun, or branch refresh, and no other autonomous work remains.
- If other autonomous work remains, the tick stays `[FIX_CODE]`. Finish that work and iterate. The manual-only blocker escalates on the next tick.
- Conclusion and rerun rules are the CI failure triage reference, keyed on `[conclusion: …]` and `[rerun authorized]` already printed on each bullet.
- Merge-group failures retain their scope, queue commit, and available log evidence but never carry `rerunCommand`, `[rerun authorized]`, or `rerun:`. The CI failure triage playbook directs the caller to fix the PR head if the failure belongs to this PR. Whenever a failing merge-group check belongs to the current removal (the PR is not queued and its head has not changed since), one numbered step triages the ejection right after the `## Failing checks` triage step, with or without `--merge` and whatever the removal reason. The step says to update from the latest base first (when no queue command is printed, only if the raw `**queue removal**` reason shows GitHub removed the entry itself; a possible human dequeue skips the update unless a conflict step requires it); on a native stack it prints the `gh stack checkout`/`gh stack rebase` route (or points at the route already printed for a conflict), and the push step pushes (`gh stack push` on a stack) only when the base update or a fix changed the head. It then prints a one-line guard. With a printed recovery command, the guard says to run `requeue:` or `acknowledge queue removal:` only if the failure does not reproduce on the updated head, neither the update nor a code change altered the head, and no other blocker remains, and names the `requeue API fallback:` trigger. Without one, it says not to enqueue. The step ends with `Playbook: "Merge queue ejection"`, which holds the fixed procedure: fix and push a failure that belongs to this PR; push an updated head that no longer fails; for a failure that comes from the base itself, record the finding in the Shepherd Journal when that step is printed, and make no change, so the unchanged failure escalates through the [`stall-timeout`](escalations.md#stall-timeout); and run the printed command only for a transient or grouped-entry failure shown by the logs or the check's details page. The `merge queue` header shows `removals on this head` when GitHub removed the current head more than once (counted from the last 10 removals since the head reached the PR, dated the same way as removal currency). Recovery commands are offered only on a head's first removal and never while the branch has conflicts. For a current removed entry with raw reason `failed_checks` in a non-stack GraphQL `--merge` session, `fix.requeue` carries the queue command and GraphQL fallback under `## Post-fix actions`. In REST mode that otherwise-eligible plan is omitted, and the shared `fix.instructions` text/JSON/MCP projection explicitly reports `transport-unsupported`; rerunning a recorded same-head enqueue only resumes its old result and cannot recover a removal. Recovery plans require usable logs or an inspectable external-provider URL for every matching failed queue check, including ticks that also carry review work. Both commands require the observed head SHA; changed heads must iterate for a fresh plan. In GraphQL mode, native-stack `FIX_CODE`, including aggregate child sessions without `--merge`, instead carries `fix.queueRemovalAcknowledgment.argv`, printed as `acknowledge queue removal:`. REST omits that acknowledgment command with the same explicit unsupported instruction because it cannot revalidate current removal evidence. The same guard and playbook apply. `apply queue-removal` validates the fresh head, queue commit, removal time, CI-driven reason, and native-stack metadata before storing a local acknowledgment. Later checks suppress only that exact removed queue commit while retaining its raw removal header and `mergeQueue.removalAcknowledged: true` (`removal acknowledged` in text); source CI, reviews, and READY delay remain required. A new head or removal does not match the acknowledgment. After fresh READY validation the existing receipt acknowledges the event ID, and the aggregate selector checks the complete lower prefix before emitting `gh stack merge`. Use the GraphQL API fallback only if gh reports auto-merge is disabled instead of enqueueing. Without `--merge`, report the failure without enqueueing; a stack acknowledgment only records local disposition and returns to the original aggregate selector options. A merge-group check without usable log evidence follows the existing `check-follow-up-unavailable` escalation when no other autonomous work remains.
- Unseen annotations on skipped, ignored, or filtered CheckRuns route here for one tick unless the conclusion is `SUCCESS`. They do not keep `fix_code` alive after the seen marker is written.
- A successful parent CheckRun is authoritative. Its annotations stay visible in `check` output and are marked seen without `FIX_CODE`.

Required checks that never reported:

- Missing required status contexts, with no check run and no status context, are their own `FIX_CODE` cause, even when other checks passed and `mergeStateStatus` is `BLOCKED`.
- On a native stack the required names come from the stack trunk (`stack.baseRefName`), not the layer's parent.
- The newest run of a name wins. A later success supersedes an older cancelled run.
- Shepherd stays on `WAIT` while a relevant check run is in progress, or a check suite with a `workflowRun` is not completed. A `QUEUED` suite with no workflow run does not count.
- The instruction says no CI is running and names the required checks that have not passed.
- A non-stack PR loads `baseRef.compare(headRef).behindBy` against the head commit OID when those contexts are missing, including when `mergeStateStatus` is `BLOCKED`.
- If that compare, the trunk compare, or derived merge status is `BEHIND`, the instruction states the commit count and says to rebase and push. On a native stack that is `gh stack rebase` then `gh stack push`. Otherwise rebase onto the PR base. That push is how the missing checks start.
- If the push does not start them, investigate. Do not close and reopen first.
- Once the branch is current, Shepherd instructs the caller to run `gh pr close <pr> -R <repo>` and `gh pr reopen <pr> -R <repo>` once for that head. The marker records that the instruction was returned; it does not verify the caller ran it.
- Internal poll debounce preview ticks do not consume this one reopen instruction. The next presented tick on that same head, still missing those contexts with nothing running, is `ESCALATE` / `required-checks-unreported`.
- A branch that is still behind stays on `FIX_CODE` and does not write the retrigger marker.
- Failing checks and merge conflicts keep their existing paths.
- Text prints `**unreported required**`, `**behind**` when the PR base compare is behind, and `**trunk behind**` when the trunk compare is behind.
- JSON uses `unreportedRequiredChecks`, `baseBehindBy`, and `trunkBehindBy`, omitted when empty.
- A `--stack` summary starts a one-PR session (`unreported-required-checks`) instead of idling in `pending-or-unknown`.

Eligible **already-seen** `COMMENTED` review summaries (surfaced in a prior iteration, body unchanged, author matches `iterate.minimizeComments`, no unresolved child thread) do **not** trigger `fix_code` on their own — iterate minimizes them in-process before computing actionable work (see CLI side-effects below), since there is no new content left to show the agent. A first-look (never-yet-surfaced) eligible summary still routes to `fix_code` for one tick so its body can be rendered; see section 8 below. If GitHub does not confirm the in-process minimize (null response, GraphQL error, rate limit — reported without throwing), that ID falls back into `reviewSummaryIds`/`## Review IDs to minimize queue` so `fix_code` still triggers and the `apply review` command remains a working fallback, instead of the summary silently staying unminimized forever.

**CLI side-effects:** GitHub exposes no exact viewer capability for workflow-run cancellation, so iterate does not cancel failing or in-progress runs and does not recommend cancellation, regardless of repository role. A rerun is different: GitHub's Actions rerun API requires `actions: write`, which rides with `WRITE`+ repository access, so `repositoryPermission` is an exact proxy for rerun capability. Iterate never issues the rerun itself — it only recommends the `gh run rerun` command for the agent to run. Independently of the action returned, iterate issues an in-process `minimizeComment` mutation only for eligible already-seen review summaries whose raw `viewerCanMinimize` value is `true`.

**Exit code:** 12

**Markdown output:**

```markdown
# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_kwDOSGizTs58XB1L](https://github.com/owner/repo/pull/42#discussion_r100) — `src/commands/iterate/index.mts:42` (@alice · User · MEMBER)

> The variable name is misleading.

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_kwDOSGizTs58XB1L --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
4. For any substantial decision or rejection, add a Shepherd Journal entry with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`, linking threads and comments by heading URL and citing reviews by ID.
5. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)` (it must equal the remote PR head). If you did, use the pushed SHA.
6. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
7. Run the `apply review:` command above with every printed ID, even if you changed no code.
8. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
```

With `--instructions playbook` (or `iterate.instructions: playbook`, or the MCP `instructions` input), steps 3 and 4 fold into one step that carries only the trigger, the concrete journal command, and a playbook pointer to "Fix-code loop" (also readable with `pr-shepherd playbook "Fix-code loop"`). The fold applies only when the generic commit/push step is printed. Without update permission the folded step omits the journal command, and the playbook's journal step applies only when that command is printed. When a conflict or queue-recovery push step replaces it, the journal step stays inline with its citation clause, because the "Fix-code loop" playbook's push to the PR head branch would conflict with the specialized push. Steps 5 and 6 stay inline because their commands need placeholder substitution, and the final `[FIX_CODE]` continuation stays inline. The default is `inline`: the bench measured the playbook default as a smaller saving than inline for the typical session.

- The summary line shows raw `**branch**` state. The caller chooses rebase and commit mechanics.
- Push access to the PR head is a usage precondition. Do not start pr-shepherd when the caller cannot push.
- `viewerCanEditFiles` and `headRepositoryPermission` stay raw context. They do not gate `[FIX_CODE]`, hide review mutations, or create a hand-off.
- Conflict and code-change ticks say to commit, push, finish SHA-gated review mutations, and iterate.
- For a non-stack conflict, Shepherd may show `## Merged PRs matching the current base` when a lookup of the 20 most recently updated merged PRs with the current base's branch name finds rows whose exact head OID and head repository match this PR's recorded base. JSON exposes the same raw rows as `mergedBasePullRequests` (number, URL, state, head branch and OID, base branch, merge time, and head repository). The first instruction asks the caller to verify whether this is the remaining layer intended for that merged parent's base. If so, change the PR base with `gh pr edit` and rerun Shepherd immediately, following the fresh result; otherwise follow the remaining conflict-resolution steps. A failed non-rate-limit lookup leaves the ordinary conflict route in place, while rate limits propagate for retry.
- `[FIX_CODE]` is always non-terminal. Only `[ESCALATE]` hands work to a human.
- `$HEAD_SHA` and `$DISMISS_MESSAGE` substitution stays in the CLI when `resolveCommand.requiresHeadSha` or `requiresDismissMessage` is set. The printed command is invalid without it.
- Shepherd recognizes its own reply only when the latest comment begins `<!-- pr-shepherd -->`. Author equality is not enough.
- An unmarked bot, non-human, or viewer-authored human thread is reply-and-resolve.
- A marked thread that is still being resolved is resolve-only, so a previous reply can be retried.
- An unmarked other-human thread stays reply-only unless `iterate.resolveOtherHumanThreads` is `outdated` or `always`.
- A marked other-human thread is already acknowledged at the default `none`.
- A caller who never loads the skill can still run the printed command. Placeholder steps are in the output.
- Dismiss-ID retention and the journal citation rule are short clauses printed in their steps, not separate playbooks: a playbook read costs the agent an extra turn that outweighs the clause. Omitting a `--dismiss-review-ids` value leaves `CHANGES_REQUESTED`.
- Bare checks, external checks, `CANCELLED`, `STARTUP_FAILURE`, and GitHub Actions failures with no usable log stay in `[FIX_CODE]` while other autonomous work remains.
- When those checks are the only blocker, the result is `[ESCALATE]` with `check-follow-up-unavailable`.
- When `mergeStatus` is `BEHIND` or `CONFLICTS` and [`iterate.behindBaseHint`](configuration.md#iteratebehindbasehint--default-) is set, one instruction echoes it: ``The branch is behind PR base branch `<base>`. <hint> before pushing.`` or ``The branch conflicts with PR base branch `<base>`. <hint> before pushing.`` The CLI does not choose the git mechanics.
- The conflicts line directly follows the merge-conflicts step. A conflicting native stack layer omits it because the gh-stack route applies.
- A later workflow attempt that is still failing while the branch is `BEHIND` or `CONFLICTS` names the PR base branch and says to inspect it for an existing fix.
- The next step says to update from that base using repository conventions. Conflict output includes resolving conflicts. A behind branch must be pushed before the next iteration.
- On a native stack layer, that update is the gh-stack rebase above, and the push is `gh stack push`. Updating one layer from its base strands the layers above it.
- `iterate.behindBaseHint` is an extra repository-specific pointer when it is set, except on a conflicting native stack layer.

When one or more threads carry a `[suggestion]` marker, `## Instructions` adds one triage step pointing at the retrieve/apply command; the refusal and drift mechanics are invariant text that lives in the pr-shepherd skill's "Suggestion patches" playbook instead of being spelled out per tick:

```markdown
## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. For every `[suggestion]` thread under `## Review threads`, run one `pr-shepherd build-suggestion-patches https://github.com/owner/repo/pull/42 --thread-id <id> --message "<one-sentence headline>" --format=json`, repeating `--thread-id` and `--message` in displayed order. Playbook: "Suggestion patches".
3. Apply every warranted review fix in each file referenced above.
4. [remaining remediation, finalization, mutation, and recurrence steps]
```

The `build-suggestion-patches` step is absent when no thread has a `[suggestion]` marker.

The review-fix step says "each file referenced above" only when `## Review threads` is present. With actionable comments alone, it says "the relevant files" because comments have no file location.

**Section order:**

1. Heading + base fields (always present).
2. `## Review threads` — active unresolved threads. Other-human active threads are marker-gated unless `iterate.resolveOtherHumanThreads` is `always`: a previously seen thread whose transcript changed is rendered again with `[edited since first look]`, while unchanged seen other-human threads are suppressed until markers are cleared. GitHub-detected bots, logins in top-level `botUsernames`, and viewer-authored human threads are returned every tick until resolved, even when unchanged. After evaluating each thread, the agent runs every generated review-mutation command even when no code change is warranted: unmarked bot/non-human and viewer-authored IDs appear in both `--reply-thread-ids` and `--resolve-thread-ids`; unmarked other-human IDs remain reply-only unless `iterate.resolveOtherHumanThreads` allows resolve. A marker-ended thread that is still being resolved is emitted resolve-only. Each thread appears under ``### `threadId=<id>` — <loc> (@author[ · <authorType>][ · <authorAssociation>][ · viewer-authored]) [reviewId=<id>]? [suggestion]?`` (or a linked `threadId` when a URL is available), where `viewer-authored` is rendered only when `viewerDidAuthor: true`, and `<loc>` is `` `path:line` `` for single-line threads or `` `path:startLine-endLine` `` for multi-line threads. The thread's full comment transcript follows, with each comment/reply rendered under ``#### `commentId=<id>` (@author[ · <authorType>][ · <authorAssociation>][ · viewer-authored])`` (or linked when a comment URL is available) and the full body as a `>` blockquote. Multi-paragraph bodies preserve empty lines as `>` lines. Threads with a ` ```suggestion ` fence in the top comment carry a `[suggestion]` tag in the thread heading and a `Replaces lines …` block after the transcript showing the parsed replacement.
3. `## Review threads to resolve` — unresolved outdated/minimized inline threads plus active marker-ended retry threads that are still being resolved; none require code edits unless the agent chooses to act on the body. Seen markers suppress repeated first-look/body display but do not remove these threads from this section or from generated mutation arguments while GitHub still reports `isResolved: false`. Unmarked bot/non-human and viewer-authored IDs are paired in `--reply-thread-ids` and `--resolve-thread-ids`; if the latest comment begins `<!-- pr-shepherd -->`, the thread is resolve-only so a previous reply can be retried without duplication. Unmarked other-human IDs are reply-only unless `iterate.resolveOtherHumanThreads` allows resolve. Marker-ended other-human threads are already acknowledged at the default `none` setting.
4. `## Actionable comments` — same H3-plus-blockquote shape as threads minus the `<loc>`: ``### `commentId=<id>` `` or `### [commentId=<id>](<url>)` when a URL is available. Non-auto-minimized comments that were previously surfaced and whose body changed are rendered with `[edited since first look]` on the heading; their marker hash is updated after display so unchanged future runs suppress them again.
5. `## Failing checks` — one bullet per failing check. Shape varies by locator:
   - ``- `<runId>` — `<workflowName> › <jobName>` `` for GitHub Actions checks (`workflowName ›` prefix omitted when unavailable; `jobName` falls back to the check name when absent).
   - ``- external `<detailsUrl>` — `<name>` `` for external status checks (codecov, vercel, etc.) with null `runId` but a URL.
   - ``- (no runId) — `<name>` `` when both are null.

   Every bullet carries a `[conclusion: <CONCLUSION>]` tag (e.g. `[conclusion: FAILURE]`, `[conclusion: TIMED_OUT]`, `[conclusion: CANCELLED]`, `[conclusion: STARTUP_FAILURE]`); null conclusions produce no tag. Attempts after the original carry `[attempt: N]`; attempt 1 is omitted as the trivial default. A check carries a `[rerun authorized]` tag when it meets every eligibility condition listed under `fix_code`'s **Trigger** above (WRITE+ role, confirmed Actions provenance, `run_attempt === 1`, not `merge_group`, not `ACTION_REQUIRED`, not still in progress). The first bullet for a given `runId` additionally carries a rerun sub-line with `gh run rerun <runId> -R <owner/repo>`; later bullets sharing that same `runId` (matrix jobs from one run) carry the `[rerun authorized]` tag but omit the repeated command line, since one rerun covers all of them. External checks (no run ID) never carry this tag. Non-CANCELLED bullets may also carry a `> <failedStep>` blockquote line (the first step that failed, GitHub Actions only), a `> <summary>` blockquote line (one-line status text from the GitHub UI), and a bounded `> <logExcerpt>` blockquote from the matched failed job log. For aggregate jobs that print `Job results`, `logExcerpt` is condensed to non-success job results plus the exit-code/error line; otherwise it is the first failed step's visible output (run-command group and post-step cleanup omitted), suffix-truncated to 4000 characters. All three are omitted when not available. When the run has other failed jobs (`failure` or `timed_out`) that are not their own failing-check bullet, the first failing bullet for that run also carries an `Other failed jobs in this run:` sub-list: one ``- `<job>` [conclusion: <CONCLUSION>]`` item per job (at most 5), each with an optional `> failed step: <step>` line and the same bounded `> <logExcerpt>` blockquote. This lets an aggregate gate job's failure be triaged from the child jobs' own errors without running `gh run view`.

   The numbered instructions emit one triage pointer for every failing check: ``Triage `## Failing checks`. Playbook: "CI failure triage".`` Rerun-versus-fix rules, including bare checks with no run id, live in that playbook. The playbook uses only evidence already included in the output and never recommends cancellation without an exact capability; a rerun is recommended only when `[rerun authorized]` is present. External checks with a non-empty URL remain `[FIX_CODE]` because that URL is an autonomous inspection path. Later-attempt failures stay `[FIX_CODE]` without another rerun command when a nonblank log excerpt supplies evidence or a behind/conflicting branch provides the branch-refresh path described above. Bare checks, CANCELLED/STARTUP_FAILURE checks, `ACTION_REQUIRED` checks, and GitHub Actions failures without a nonblank log excerpt require manual follow-up when they have no authorized rerun. They appear under `[FIX_CODE]` only while other autonomous work remains: the agent completes that work and iterates again. When those checks are the only remaining blockers, Shepherd returns `[ESCALATE]` with trigger `check-follow-up-unavailable`. They never make a `[FIX_CODE]` completion terminal.

6. `## Check annotations` — inline annotations attached to completed non-passing `CheckRun` checks (failing, skipped, ignored, or filtered), grouped by the same check locator used in `## Failing checks`. Each bullet includes the marker-gated annotation ID (`check_annotation_…`), optional blob link, file range, raw annotation level, optional title, bounded message blockquote, and optional bounded raw details blockquote. In-progress checks are not fetched. Each annotation is surfaced once per PR through the seen-marker store and does not add any resolve/minimize mutation ID. After that tick the annotation is omitted from later output. Not emitted when empty. When this section is present without any failing conclusions, `## Failing checks` is omitted. An annotation whose message is exactly `Process completed with exit code N.` with no raw details and no title is dropped entirely — it carries nothing beyond the check's own `[conclusion: …]` tag; a title alone is enough to keep it (the title, path:line anchor, and blob link survive). When a message or raw-details block is byte-identical to text already present in that check's `## Failing checks` log excerpt, only the blockquote is dropped; the bullet (with its `path:line` anchor and blob link) still renders, since that anchor is not in the log excerpt. A check whose annotations are all dropped this way is omitted from the section; the section itself is omitted when every check's annotations are dropped.
7. `## Changes-requested reviews` — `CHANGES_REQUESTED` reviews. Each entry (other than the terse `staleBotCr` reminder below) is rendered with an H3 heading (``### `reviewId=<id>` (@<author>[ · <authorType>][ · <authorAssociation>])``) and the full body as a `>` blockquote (`(no review body)` when empty) — the same shape as sections 8-11 below. **Human-authored CRs are marker-gated**: each entry is emitted once, then suppressed until the body changes. Edited reviews are emitted again with `edited: true` in JSON. Human CRs are never auto-dismissed — the reviewer must re-review or dismiss themselves. Generated dismissal eligibility uses GitHub's `viewerCanAdminister` when the selected transport supplies it; REST capability is unknown, so an otherwise-eligible bot dismissal is attempted. A successful dismissal stays repeatable until the review leaves `CHANGES_REQUESTED`; a denied dismissal is surfaced once, omitted from later generated commands until edited, and does not trigger `authorization-required`. The first emission renders the full body; subsequent authorized reminders render a terse one-line form carrying `staleBotCr: true`. **Stale CR detection** — a review is marked `staleReview: true` in JSON when its `commit.oid` differs from `headRefOid` AND every associated review thread (matched by `thread.reviewId === review.id`) is `isResolved || isOutdated`. Reviews with no associated threads are treated conservatively and are NOT marked stale. **Stale bot CRs** follow the same routing and gain a `[stale — review is on an old commit, all threads resolved]` tag in text output. **Stale human CRs** carry a `[stale — review is on an old commit, all threads resolved; ask reviewer to re-review or dismiss]` tag and are never added to `--dismiss-review-ids`; do not treat them as fresh feedback requiring code changes.
8. `## Review summaries (first look)` — `COMMENTED` review summaries the agent has **not yet seen**. Each entry is rendered with an H3 heading (``### `reviewId=<id>` (@<author>[ · <authorType>][ · <authorAssociation>])``) and the full body as a `>` blockquote. Non-human IDs eligible under `iterate.minimizeComments` are included in `--minimize-comment-ids` only when every known inline child thread from that same review is resolved; human IDs are surfaced once, marked seen, and never minimized. Not emitted when empty.
9. `## Review summaries (edited since first look — already minimized; do not re-minimize)` — `COMMENTED` review summaries whose body was edited by the author after Shepherd last surfaced them. Each entry is rendered the same way as section 8 (H3 heading + `>` blockquote). These IDs are **NOT** included in `--minimize-comment-ids` — the review is already minimized on GitHub (or was in a prior iteration's minimize queue). Read the updated body and record any Shepherd Journal note, but do not pass these IDs to any mutation flag. The seen-marker hash is updated after display so the next run only re-surfaces them if the body changes again. Not emitted when empty.
10. `## Review IDs to minimize queue` — backticked review IDs (`PRR_…`) queued for `--minimize-comment-ids` that are not first-look bodies. Eligible non-human `COMMENTED` review summaries whose bodies were surfaced in a **prior** iteration are minimized in-process (see `## fix_code` CLI side-effects above) and never reach this section — unless the selected transport does not support minimization or GitHub does not confirm the in-process mutation (null/error/rate-limit), in which case the ID falls back here when retrying through the supported generated command. What else remains here: classification-rule `autoResolve` review-summary IDs not consumed by `actions.autoMinimizeSuppressed`, and — when `iterate.minimizeApprovals` is `true` — matching non-human `APPROVED` review IDs queued for minimization even though their bodies were not previously surfaced. REST cannot minimize comments; it surfaces the item as a one-look skip instead of emitting an unsupported generated operation. A suppressed rule-matched summary that cannot be minimized returns to the normal first-look/edited visibility gate. All IDs from sections 8 and 10 that pass the selected transport's operation support and policy are merged into `--minimize-comment-ids`. Not emitted when empty.
11. `## Approvals (surfaced — not minimized)` — emitted for `APPROVED`-state reviews that are not routed to `--minimize-comment-ids` (including the default `iterate.minimizeApprovals: false`, human approvals, non-human approvals excluded by `iterate.minimizeComments`, or items whose minimize operation is denied or unsupported). H3 heading uses `` `reviewId=<id>` `` (same prefix scheme as other item types); body is a `>` blockquote or `(no review body)` when empty. A denied or unsupported item is surfaced once and marker-gated afterward. Surfaced approvals are never included in `--minimize-comment-ids` and do not count as autonomous work that postpones a `check-follow-up-unavailable` escalation.
12. `## First-look items (N) — acknowledge status before acting` — threads and PR comments that are outdated, resolved, or minimized and have not yet been acknowledged by the agent. Emitted on first encounter only; a per-item seen-marker file (`src/state/seen-comments.mts`) suppresses them on subsequent runs. Each bullet carries a `[status: …]` tag: `outdated`, `resolved`, or `minimized`. If a thread transcript or comment body was edited since the item was first acknowledged, the tag gains an `, edited` suffix (e.g. `[status: minimized, edited]`). Thread bullets include the full comment transcript and links so a reply to a resolved thread gives the agent enough context to view or act on the entire thread again. If a first-look human thread also appears under `## Review threads to resolve`, its ID follows the same viewer/marker and authorization routing as the section above; marker-ended other-human threads are already acknowledged and do not appear for mutation. Otherwise, do not pass first-look-only IDs to mutation flags. Active unresolved threads are marker-gated under `## Review threads`, not duplicated here. Not emitted when empty.
13. `## In-progress runs` — reserved for compatibility and currently omitted. GitHub exposes no exact viewer capability for workflow-run cancellation.
14. `## Protected runs` — reserved for compatibility and currently omitted because Shepherd does not cancel workflow runs.
15. `## Cancelled runs` — reserved for compatibility and currently omitted.
16. `## Post-fix actions`:
    - ``- base: `<branch>` `` — raw PR base branch context.
    - ``- resolve-only: `<argv>` `` — present when authorized standalone resolve/minimize mutations are split from a message-bearing command, including authorized marker-ended viewer-authored retry resolves. Its instruction appears before `apply review:` and requires no substitutions. Omitted when all mutations are combined into one command.
    - ``- apply review: `<argv>` `` — fully quoted apply command containing IDs selected by iterate's available capability and semantic routing. When GraphQL supplies capability fields, those fields filter generated actions. REST has no equivalent viewer-capability fields, so otherwise-eligible operations are attempted and GitHub's response is authoritative. Viewer-authored human resolution retains the reply/marker routing described above. A separate, user-directed `apply review` forwards its explicitly supplied IDs without applying this generation policy and surfaces GitHub's result.
17. `## Instructions` — numbered list to execute in order. When a `resolve-only:` bullet is present, a `Run the resolve-only: command` step precedes the `Run the apply review: command` step. The instructions reference the command bullets by name rather than duplicating them — that single source of truth is what the skill executes.

**Body truncation (Markdown only):** thread, actionable-comment, changes-requested-review, and review-summary bodies (sections 2–4, 7, 8, 9, 11, and 12 above) are capped at 1,200 characters for a top-level body and 600 characters for a nested thread reply — a thread's first transcript entry (the original comment) always gets the top-level budget even when replies follow. The cap keeps a head and a tail so an opening question and a trailing summary both survive; when a single line is too long to fit either end on its own, that line falls back to a character-level slice instead of being dropped outright. An elided body carries `[…N chars elided — full text: <pointer>]` in place of the missing middle. `<pointer>` is a `gh api repos/<owner>/<repo>/pulls/comments/<id>` (inline review comment) or `gh api repos/<owner>/<repo>/issues/comments/<id>` (PR-level comment) command the agent can run directly — no browser round-trip — derived from the comment's own URL; it falls back to the bare URL when the shape isn't recognized, and is omitted where no URL is available at all (e.g. review summaries). The cut point always snaps to a line boundary outside any ` ``` ` or `~~~` fence, so a capped body never leaves an unterminated fence — if no fence-safe cut exists (a single fence spanning the whole body), the body is left uncapped rather than risk corrupting every section rendered after it. Pass `--verbose` to render bodies uncapped. **JSON is never capped:** `body` fields always carry the full text regardless of format or `--verbose` — the Markdown cap is a presentation choice over the same fetched data, not a difference in what iterate retrieved, so a capped Markdown body's linked pointer and the corresponding JSON `body` field always agree.

The JSON payload exposes the same data under `fix.{threads, resolutionOnlyThreads, actionableComments, reviewSummaryIds, firstLookSummaries, editedSummaries, surfacedApprovals, checks, changesRequestedReviews, resolveCommand, resolveOnlyCommand, instructions, firstLookThreads, firstLookComments, inProgressRunIds, protectedRuns}` plus top-level `baseBranch`, `branchProtection` (on `IterateResultBase`, not under `fix`; omitted in lean JSON when `null`, always present in verbose JSON), and `cancelled`.

Comment/review/thread objects include `authorType` (`User`, `Bot`, or `Unknown`) and the raw GitHub `authorAssociation` when available. Inline thread objects and transcript comments additionally expose `viewerDidAuthor: true` when GitHub identifies the authenticated viewer as their author; GraphQL returns this flag, while REST compares the actual author login with `/user`. A missing REST viewer identity leaves the flag omitted. Text author labels append `viewer-authored` for the same true-only signal. These values are provenance, not a trusted/untrusted classification. For routing, only the original inline comment's `viewerDidAuthor` grants the narrow viewer-owned human exception; it does not make an unmarked latest comment a Shepherd reply. Thread objects keep top-comment fields (`body`, `author`, `url`) and include `comments[]` with the full thread transcript. `fix.actionableComments[]` includes `edited: true` when a non-auto-minimized PR comment body changed after Shepherd previously surfaced it. `fix.changesRequestedReviews[]` items include `commitOid` (the commit the review was made against) when available, and `staleReview: true` when the review is stale (commit behind HEAD, all threads resolved/outdated). REST sets stale-review evidence only when the complete CCR thread snapshot proves every associated thread resolved or outdated. Standard REST's unknown thread status never proves staleness. In lean JSON mode, optional fields are omitted when unavailable.

Generated iterate commands and automatic side effects use capability data when the selected transport supplies it. GraphQL returns per-object fields (`viewerCanMinimize`, `viewerCanReply`, `viewerCanResolve`) and PR/repository fields (`viewerCanUpdate`, `viewerCanEnableAutoMerge`, `viewerCanAdminister`, `viewerPermission`). REST has no equivalent viewer-capability fields, so otherwise-eligible operations are attempted and GitHub's response is authoritative. A generated review mutation denied by GitHub is surfaced once, then skipped until edited and excluded from fix-thrash accounting. Unsupported REST minimization is surfaced as a one-look skip. Omission from a generated command means only that Shepherd did not select the ID for automation; it does not prohibit an explicit user-directed mutation. Direct `apply review` forwards the requested IDs without applying iterate's author, capability, or current-state policy and surfaces GitHub's per-operation results. Explicit merge/enqueue requests likewise rely on GitHub's response.

Generated journal guidance uses capability fields when available, but direct `apply journal` attempts the requested PR-body update and surfaces GitHub's result. `apply files` performs the requested file-view mutation where supported; REST reports it as unsupported.

A cloud proxy session-access refusal is not a GitHub-denied review item. `apply review` stops the batch, preserves successful mutation IDs, and returns the proxy message in `sessionRefusal` with the remaining IDs in `unrepliedThreads`, `unresolvedThreads`, `unminimizedComments`, and `undismissedReviews` when nonempty. The CLI exits `77`; Markdown and MCP render the same successes, refusal, and pending IDs. The raw result's `instructions` array also renders as numbered steps under `## Instructions`: repair session access and retry only those pending IDs. No denied marker is written. Automatic cleanup aborts the incomplete tick with exit `77`, and a session refusal during mark-ready escalates with `transport-unsupported` while quoting the proxy message.

`fix.checks[]` includes `relatedJobs: [{ name, conclusion, failedStep?, logExcerpt? }]` (the sibling failed jobs described above; same information as the text sub-list, also present on `escalate` checks) and `logExcerpt` when Shepherd fetched a bounded raw excerpt from the matched failed job log and `runAttempt` when GitHub reports an attempt later than 1. `fix.checks[]` also includes skipped, ignored, or filtered CheckRuns that still have unseen annotations; those rows carry `annotationOnly: true` and are omitted from `## Failing checks` and from failing-check rerun/`--require-sha` gating. Passing CheckRuns and their annotations remain available in `check` output but are not projected into `FIX_CODE`. `fix.checks[].annotations[]` contains marker-gated annotations: `{ id, path, startLine, endLine, startColumn?, endColumn?, level, title?, message, rawDetails?, blobUrl? }`. Annotation `message` and `rawDetails` values are capped independently before rendering or JSON projection. Seen annotations are not re-emitted.

`fix.inProgressRunIds` and `cancelled` remain empty. GitHub exposes no exact viewer capability for workflow-run cancellation, so neither Markdown nor JSON recommends it, regardless of repository role.

`fix.checks[].rerunCommand` is present only when a check meets every rerun-eligibility condition listed under `fix_code`'s **Trigger** above, including `run_attempt === 1`; JSON carries it on every eligible check (not deduplicated), while Markdown prints the `rerun:` sub-line once per distinct `runId` — see section 5. Shepherd never runs the rerun itself — the CLI only recommends the `gh run rerun` command for the agent to execute, matching the `commit-suggestion` pattern used elsewhere for git mutations.

`fix.protectedRuns` remains empty because Shepherd does not cancel workflow runs.

`branchProtection` is `null` when no branch protection rule applies or REST cannot provide the field; otherwise it carries GitHub's raw rule values. `resolutionOnlyThreads` contains unresolved outdated/minimized review threads plus active marker-ended retry threads that are still being resolved. When GraphQL supplies capability values, unmarked bot/non-human and viewer-authored threads are paired in reply and resolve flags only when both capabilities are true; a marked retry that is still being resolved needs `viewerCanResolve: true`. REST has no equivalent capabilities, so otherwise-eligible operations are attempted. An unmarked other-human thread remains reply-only by default unless `iterate.resolveOtherHumanThreads` allows resolve. Authorized reply/resolve mutations still emit by thread ID when GitHub clears the path or line; they do not count toward `fix-thrash`. A GitHub-denied review mutation is surfaced once, omitted from later generated commands, and marker-gated until edited. `reviewSummaryIds` contains policy-eligible non-human review IDs only when minimization is supported by the selected transport. Denied or unsupported cosmetic operations are surfaced once and then marker-gated without an unsupported mutation command.

`firstLookSummaries` carries the full `Review` objects for bodies seen this iteration for the first time. `editedSummaries` carries the full `Review` objects for summaries whose body changed since last seen — these IDs are **NOT** in `reviewSummaryIds`. `changesRequestedReviews` and `surfacedApprovals` are also marker-gated: unchanged review bodies are suppressed, edited bodies re-surface. `resolveCommand.argv` starts with `["pr-shepherd", …]`. `fix.resolveOnlyCommand` is present when resolve-thread and minimize-comment mutations are split from the reply command, including a marker-ended retry that is still being resolved; it carries `requiresHeadSha: false` and no `$DISMISS_MESSAGE` placeholder. In lean JSON mode, `fix.*` arrays that are empty are omitted; `cancelled` is omitted when empty; `resolveOnlyCommand` is omitted when not present. Pass `--verbose` to include all fields. `firstLookThreads` and `firstLookComments` are informational unless the same thread appears in `resolutionOnlyThreads`.

For `escalate`, `escalate.stalledChecks[]` is emitted when unstarted CI caused `stall-timeout`; each entry includes `name`, raw `status`, `source`, `runId`, `detailsUrl`, `ageSeconds`, and any available `createdAtUnix`, `startedAtUnix`, `updatedAtUnix`, and `summary`. A `check-follow-up-unavailable` escalation emits `escalate.checks[]` with the same raw check fields and bounded annotations used by `fix.checks[]`; Markdown renders their run or external source, workflow/job, conclusion, scope/commit, failed step, summary, log excerpt, rerun command when present, and annotations. A merge-queue removal escalation also emits `escalate.mergeQueueRemoval` with `createdAtUnix` plus any available raw `reason`, `actor`, `beforeCommitOid`, and `beforeCommitParentOids`. When a result with automatically selected review mutations becomes an escalation, `escalate.pendingReviewCommands` retains its non-empty `resolveOnlyCommand` and/or `resolveCommand`; Markdown renders the same argv under `## Pending review commands`. `escalate.firstLookSummaries` and `escalate.editedSummaries` retain review-summary bodies that must be surfaced on that tick, including before a pending minimization. Escalations with no pending review mutation or surfaced summary omit the corresponding object or array.

**Resolve command rules (same in Markdown and JSON):**

- A leading `<!-- pr-shepherd -->` in the latest visible comment is the only signal for a prior Shepherd reply; author equality is not sufficient. The generated command does not re-reply to a marked thread. An unmarked bot/non-human or viewer-authored human thread may appear in both reply and resolve flags. Generated unmarked other-human work remains reply-only unless `iterate.resolveOtherHumanThreads` allows resolution. A marked other-human thread is already acknowledged at the default `none` setting. These rules select automatic commands only; a separate user-directed `apply review` forwards explicitly supplied IDs.
- `--require-sha "$HEAD_SHA"` is appended to the `apply review:` command when it contains `--reply-thread-ids` following actionable thread fixes, when failing checks are being addressed, or whenever `--dismiss-review-ids` is present (dismissal is a post-push operation that must race-check against a moving HEAD). The `resolve-only:` command (marker-ended retries that are still being resolved, plus minimize-only work) never carries `--require-sha` — run it independently of any SHA check.
- `$DISMISS_MESSAGE` must be one specific sentence describing what changed — never generic text like "address review comments".

### Applying ` ```suggestion ` blocks

GitHub reviewers can leave ` ```suggestion ` fenced blocks in review thread bodies. The CLI parses these and surfaces them in two additions to each thread:

- A `[suggestion]` marker on the heading.
- A `Replaces line(s) …` block immediately after the blockquoted body, showing the parsed replacement. An empty suggestion (deletion) uses the label `Replaces line(s) … with nothing:` followed by an empty fenced block.

When at least one thread has a `[suggestion]` marker, `## Instructions` emits one CLI step naming the retrieve/apply command (the CLI substitutes the real PR number; `<id>` and `<one-sentence headline>` are left for the agent to fill in) plus a pointer to the pr-shepherd skill's "Suggestion patches" playbook. That playbook — reproduced below as reference documentation, since it is invariant across every invocation and no longer repeated in `## Instructions` — covers the structured path, the manual fallback, and the refusal/drift distinctions.

**Step 1 — structured path (preferred):**

> For all threads marked `` `[suggestion]` `` under `` `## Review threads` ``, run one `` `pr-shepherd build-suggestion-patches https://github.com/owner/repo/pull/42 --thread-id <id> --message "<one-sentence headline>" --format=json` `` command, repeating the thread/message group in displayed order. Apply, stage, and commit the returned patches in order. The patch command does not recommend a push or review mutation; use authorization-checked iterate output for remote actions.

`build-suggestion-patches` builds every diff from the fetched PR-head blobs, permits a local HEAD that descends from that PR head, and dry-runs the ordered stream with `git apply --check` before returning anything. Each patch retains its own suggested commit message and `Co-authored-by: <reviewer>` trailer. The instructions apply and commit patches in input order without recommending a push.

**Manual fallback:**

> When `build-suggestion-patches` refuses because a suggestion is unsafe or no longer applies, inspect the current source together with the displayed `Replaces lines …` block and reviewer intent, then make the intended edit manually. Do not apply a stale numeric range blindly after source drift.

Returned patches were already checked against the current clean worktree. If one later fails, the worktree changed after validation; inspect the new source and reviewer intent rather than retrying or applying the old numeric range verbatim.

---

**Single-line suggestion.** Heading `src/foo.ts:42`:

````markdown
### `threadId=PRRT_kwDOSGizTs58XB1L` — `src/foo.ts:42` (@alice) [suggestion]

> Rename `x` to `remainingSeconds` so readers don't have to trace back to the declaration.
>
> ```suggestion
> const remainingSeconds = computeRemaining();
> ```

Replaces line 42:

```
const remainingSeconds = computeRemaining();
```
````

Structured path: run `pr-shepherd build-suggestion-patches https://github.com/owner/repo/pull/42 --thread-id PRRT_kwDOSGizTs58XB1L --message "rename x to remainingSeconds" --format=json`, then follow the ordered `## Instructions`. Manual fallback: inspect `src/foo.ts`, the replacement block, and reviewer intent before editing.

**Multi-line suggestion.** When the thread spans a range, the heading shows `path:startLine-endLine` (e.g. `src/foo.ts:40-42`). The `Replaces lines 40–42:` block contains the replacement spliced in for that entire range. An empty block means "delete those lines"; a block containing a single blank line means "replace with one blank line".

````markdown
### `threadId=PRRT_kwDOSGizTs58XB2M` — `src/foo.ts:40-42` (@alice) [suggestion]

> Collapse these three assignments into one.
>
> ```suggestion
> const result = computeAll();
> ```

Replaces lines 40–42:

```
const result = computeAll();
```
````

Structured path: run `pr-shepherd build-suggestion-patches https://github.com/owner/repo/pull/42 --thread-id PRRT_kwDOSGizTs58XB2M --message "collapse three assignments" --format=json`, then follow the ordered `## Instructions`. Manual fallback: inspect the current range and reviewer intent before editing.

**Multiple suggestions (two or more threads).** Invoke `build-suggestion-patches` once with one repeated `--thread-id … --message … [--description …]` group per thread in displayed order. The command returns an ordered patch list only after the complete series passes `git apply --check`. Apply and commit each patch in order, then continue only with authorization-checked iterate output.

````markdown
## Review threads

### `threadId=PRRT_kwDOSGizTs58XB1L` — `src/foo.ts:42` (@alice) [suggestion]

> ```suggestion
> const remainingSeconds = computeRemaining();
> ```

Replaces line 42:

```
const remainingSeconds = computeRemaining();
```

### `threadId=PRRT_kwDOSGizTs58XC2M` — `src/bar.ts:17` (@alice) [suggestion]

> ```suggestion
> return value ?? defaultValue;
> ```

Replaces line 17:

```
return value ?? defaultValue;
```
````

The `apply review:` command at the bottom of `## Post-fix actions` includes both IDs when their capabilities authorize the mutations:

```
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_kwDOSGizTs58XB1L,PRRT_kwDOSGizTs58XC2M --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`
```

Both IDs stay in `--reply-thread-ids` — `build-suggestion-patches` does not resolve threads automatically. If a suggestion was handled manually instead, its ID still belongs in `--reply-thread-ids`.

**What the skill does:** Follow `## Instructions` in order. The instructions are self-contained and action-specific — no dispatch table needed. See `## Instructions` in the output for the exact steps. `[FIX_CODE]` always returns to `pr-shepherd [PR] --until-terminal` after the work is handled; it never hands work to a human.

---

## `escalate`

Ambiguous state that requires human judgement — iteration stops and surfaces details.

**Trigger:** Any of:

- **`stall-timeout`** — the iterate result has not materially changed for `config.iterate.stallTimeoutMinutes` minutes (default 60), or a relevant CI check/status context has stayed pending without starting for that long. Catches loops where the same failing test, transient error, or pending state repeats indefinitely without progress. The generic timer resets whenever the HEAD SHA, failing-check set, or actionable item IDs change. A `--stack` selection whose layers can only wait keeps its own stack-level timer with the same threshold ([`stall-timeout`](escalations.md#stall-timeout)). Override with `--stall-timeout <duration>` — a bare number is minutes (e.g. `--stall-timeout 90`), or use an explicit `s`/`m`/`h` suffix (e.g. `--stall-timeout 90s`, `--stall-timeout 1h`); `--stall-timeout 0` disables. The escalation message renders the elapsed time in whatever unit reads best (seconds, minutes, or hours), independent of the flag's input unit.
- **`required-checks-unreported`** — required merge-target contexts still have no check run and no status context after one close/reopen of this head, and no Actions workflow is running. Rebase and push is the fix while the base or stack trunk compare is behind, including when `mergeStateStatus` is `BLOCKED`. Another reopen will not create a job the workflow does not emit. Path filters are the usual cause. A repeated rebase for a behind branch stays on `FIX_CODE` until the ordinary `stall-timeout` timer fires. See [`required-checks-unreported`](escalations.md#required-checks-unreported).
- **`stall-state-unavailable`** — the stall timeout is enabled, and Shepherd could not read or write the one-PR or `--stack` stall timer. The suggestion quotes the filesystem error. Fix `PR_SHEPHERD_STATE_DIR` or the directory permissions, then resume. `--stall-timeout 0` leaves the original action in place. Text and JSON both carry the trigger on `escalate.triggers`; a stack summary carries it in `instructions`. See [`stall-state-unavailable`](escalations.md#stall-state-unavailable).
- **`fix-thrash`** — the same retryable, located active thread body remains unchanged and unresolved after being returned in `config.iterate.fixAttemptsPerThread` caller-visible `FIX_CODE` results (default 3). Those results each repeat the pending review commands; the following unchanged tick escalates and retains the commands. Internal debounce ticks do not count. Threads suppressed by seen markers, location-independent outdated-bot resolutions, other threads without a path/line, and threads with unauthorized required mutations do not count; edited thread bodies reset the per-thread attempt count.
- **`base-branch-unknown`** — the GraphQL batch did not yield a usable base branch name: the derived value was empty or contained unsafe characters. Preempts any `[FIX_CODE]` that would require a push, since rebasing onto the wrong base is worse than pausing iteration.

- **`authorization-required`** — an otherwise-eligible automatic mark-ready operation was denied by GitHub, or GraphQL capability data was false or unavailable and therefore failed closed. On the supported cloud CCR route REST has no capability field, so Shepherd attempts mark-ready and uses GitHub's response; an unavailable route uses `transport-unsupported`. Explicit merge/enqueue, review, journal, and file-view requests surface the selected transport's result or unsupported-operation error. Review replies, thread resolutions, bot-review dismissals, and pushes never use this trigger.
- **`check-follow-up-unavailable`** — no other autonomous work remains, and every failing check either is a later workflow attempt without a nonblank log excerpt after Shepherd's single rerun allowance was consumed, requires a human-only action (`ACTION_REQUIRED`), is `CANCELLED`/`STARTUP_FAILURE` without an authorized rerun, is a GitHub Actions failure with no nonblank included log excerpt and no authorized rerun, or is truly bare (no run ID and no non-empty details URL). A later attempt with a nonblank log excerpt remains autonomous `FIX_CODE` investigation work; no second rerun command is emitted. A non-empty external details URL is actionable and never triggers this escalation by itself. `escalate.checks[]` preserves the raw check details for the human.
- **`merge-queue-removed`** — the latest queue removal is newer than the latest enqueue and no queue-commit failure or other actionable work gives the agent concrete remediation. Failing queue CI stays `FIX_CODE`. The result includes GitHub's raw reason, actor, timestamp, and queue commit for the human decision, rendered under a `## Merge queue removal` heading (`- reason:`, `- actor:`, `- createdAtUnix:`, `- queue commit:`).

The closed trigger list and full predicates are in [`docs/escalations.md`](escalations.md).

**CLI side-effects:** None.

**Exit code:** 13

**Markdown output:**

```markdown
# PR #42 [ESCALATE]

**status** `UNRESOLVED_COMMENTS` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `fix-thrash`

The same thread(s) remain unresolved after their pending commands were returned for 3 FIX_CODE ticks. Automated iteration is paused for a manual decision.

## Items needing attention

- thread `PRRT_kwDOSGizTs58XB1L` — `src/commands/iterate/index.mts:42` (@alice): The variable name is misleading

## Fix attempts

- thread `PRRT_kwDOSGizTs58XB1L` pending commands returned 3 times

## Pending review commands

- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_kwDOSGizTs58XB1L --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

---

After completing manual fixes, resume only after every required remote update has been performed by a credential whose push authorization was established outside Shepherd; then rerun `/pr-shepherd:pr-shepherd 42`.

## Instructions

1. Stop polling. Ask the user whether to run the pending review commands shown above.
2. If yes, replace any `$HEAD_SHA` with the full 40-character pushed PR-head SHA and any `$DISMISS_MESSAGE` with a one-sentence disposition, run every pending command, then rerun Shepherd with the same options.
```

The block after the base-fields line (separated by a blank line) is `escalate.humanMessage` in JSON — ready to print verbatim.

**What the skill does:** Follow `## Instructions`: pause automatic polling, preserve the displayed commands, and use them if the human directs recovery.

---

## Classification rules

Drop `.ts`, `.mts`, `.mjs`, or `.js` files under `.pr-shepherd/classification/` to suppress bot-noise items and/or queue them for automatic resolution, without any agent involvement.

Each file must have a default export matching:

```ts
import type { ClassifyRule } from "pr-shepherd/classify";
export default function rule(item: ClassifyItem): ClassifyAction | null {}
```

The `ClassifyItem` union covers four kinds: `"review-thread"`, `"pr-comment"`, `"review-summary"`, and `"changes-requested"`. Each item carries `id`, `author`, `authorType`, optional raw GitHub `authorAssociation`, `body`, and (for threads) `path`. Association values are context only; rules decide how, if at all, to use them.

`ClassifyAction` has two optional boolean flags and an optional note:

- `suppress: true` — hides the item from agent output; the seen marker is still written so the item does not re-surface as first-look on the next tick.
- `autoResolve: true` — routes the item's ID into the resolve/minimize mutation: threads go to `--resolve-thread-ids`, PR comments and review summaries go to `--minimize-comment-ids`. When combined with `suppress: true` and [`actions.autoMinimizeSuppressed`](configuration.md#actionsautominimizesuppressed--default-true) is `true` (the default), Shepherd performs the authorized mutation itself, records it (see [Classification auto-resolve](#classification-auto-resolve) below), and leaves only failed IDs on the generated `apply review` command. Not supported for `"changes-requested"` items (dismissing a review requires an explicit message).
- `reason` — optional note printed in the auto-resolve line, stored as `ruleReason`, and included in the Shepherd Journal item when this rule fires.

Rules from multiple files combine permissively: `suppress` and `autoResolve` are OR'd across all matching rules for a given item, and every non-empty `reason` is kept.

Files starting with `_` or `.` are ignored. The loader walks up from `cwd` looking for `.pr-shepherd/classification/`, stopping at the home directory. Unlike `.pr-shepherdrc.yml`, only the first classification directory found is used. TypeScript rule files (`.ts` / `.mts`) are loaded by the runtime's native TypeScript support, so keep them to erasable syntax such as type annotations and `import type`. Runtime TypeScript features that need transpilation, such as enums, namespaces, parameter properties, and decorators, are not supported. Use `.mts` for portable ESM rules across Node, Bun, and Deno.

Example rules for common bot-noise patterns are in [`examples/classification/`](../examples/classification/).

## Classification auto-resolve

On a tick where `actions.autoMinimizeSuppressed` applied at least one confirmed resolve or minimize, or where one of those mutations failed, iterate prints `## Classification auto-resolve` immediately before `## Instructions` on every action. JSON and MCP carry the same object as `ruleAutoResolve`. The section and field are omitted when nothing was applied and nothing failed. Empty `threads`, `minimized`, and `errors` arrays are omitted.

The summary is one line, for example `auto-resolved 2 threads, minimized 1 comment and 1 review summary (rules: review-bot suppressed; quota)`. One reason uses `(rule: …)`; several distinct reasons use `(rules: …)` joined with `; `. Review summaries are counted separately from PR comments. Bullets under the summary are thread and comment URLs (a review-summary URL when GitHub returned one, otherwise the backticked id). Mutation and journal failures are further bullets in the same section, not a second summary. A failure-only tick reads `auto-resolve failed for N mutation(s)`, plus the rule clause from `threads.autoResolveErrorReasons`. Those are the rule values themselves, so a reason that contains `)` or `; ` stays one reason. Shepherd does not parse reasons back out of the error text.

`ruleAutoResolve.threads` is the confirmed `threads.autoResolved` list (`isResolved: true`, plus `ruleReason` when a rule supplied one). `ruleAutoResolve.minimized` is `comments.autoMinimized`: `{ id, url?, kind: "pr-comment" | "review-summary", ruleReason? }`. `ruleAutoResolve.errors` is `threads.autoResolveErrors`, each string `"<id>: <message>"` plus ` (rule: <reason>)` when the matching rule supplied one. IDs in `errors` stay in `threads.ruleAutoResolveIds`, `comments.minimizeIds`, or `ruleAutoResolveReviewSummaryIds` so the generated `apply review` command is the retry path.

After confirmed successes, Shepherd appends one Shepherd Journal list item with the token login (`as @login`, or `(token login unavailable)`), the same reasons, and the URLs. A journal read or write failure is added to `errors` and does not undo the resolve or minimize. Exact-text dedupe in the journal append covers a retry of the same item.

A swallowed poll tick (`WAIT`, a `MARK_READY` continuation, or a `FIX_CODE` debounce discard) writes that same summary line to stderr, including under `--quiet-status`. The tick returned as stdout does not also print it on stderr. A reused fingerprint drops `autoResolved`, `autoResolveErrors`, `autoResolveErrorReasons`, and `autoMinimized` before the next tick, so the line and journal entry are not replayed.

`actions.autoMinimizeSuppressed: false` does not mutate, journal, or print the line. Those IDs stay on the generated `apply review` command.
