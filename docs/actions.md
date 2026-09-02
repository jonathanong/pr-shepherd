# shepherd actions

[← README](../README.md)

Each `pr-shepherd iterate` invocation returns exactly one action. The bare `pr-shepherd <PR>` command runs the bounded poll dispatcher and prints the final iterate action. The shipped skill instead uses `pr-shepherd [PR] --until-terminal`. See [iterate-flow.md](iterate-flow.md) for the decision order and [context.md](context.md) for what the header and body gather.

CLI `PR` accepts a positive number, `owner/repo#N`, or a GitHub pull-request URL. A qualified reference selects its repository for GitHub I/O; the current working directory remains the local git, configuration, classification-rule, and debug-log context. Direct MCP calls still require a qualified reference, but it can name any accessible repository.

The default output format is Markdown — what the skill receives from its until-terminal poll dispatcher and what direct CLI users see. `--format=json` emits the same action data as a single JSON object for scripting. Every example below shows what the agent actually sees in the default (lean) format.

The bare CLI command accepts `--interval`/`--timeout`/`--debounce`/`--quiet-status` (e.g. `pr-shepherd <PR> --interval 60s --timeout 4.5m --quiet-status`), waits while the PR remains in `[WAIT]`, and returns on an agent-facing action. With `--merge`, it also continues through `MARK_READY` and returns `MERGE` when the ready-delay completes. Each ordinary `WAIT` tick writes an explicit still-running line to stderr; the final action remains the only stdout result. If `--timeout` expires during WAIT polling, the bounded command returns that final `WAIT` result.

The shipped skill invokes `pr-shepherd [PR] --until-terminal`. That command continues through ordinary `WAIT` and `MARK_READY` actions, then returns `FIX_CODE` (after `--debounce`, default 1m and `0` disables), `MERGE`, any non-terminal quota-warning result, or terminal `CANCEL`/`ESCALATE`. A quota warning returns immediately so the skill can follow its cadence instructions and re-invoke the command without a `--timeout`. After every returned non-terminal result, the skill follows `## Instructions` and invokes the same canonical command again. Debounce ticks set `persistSeen: false` — seen markers and first-look suppression wait for the post-window tick. `--quiet-status` keeps unchanged WAIT ticks out of agent context. MCP callers invoke one `iterate` tick at a time (no debounce) and let their host schedule the next call.

Command examples call `pr-shepherd` directly everywhere a follow-up command is emitted.

Pass `--verbose` to get more debug state. In JSON mode, the output starts from the full `IterateResult` shape (all fields, including `baseBranch`, `checks`, `shouldCancel`, and command-scoped `apiUsage`) and then applies the same instruction projection as lean JSON: non-`fix_code` actions get a top-level `instructions` array, and `fix.instructions` may be rewritten. In Markdown mode, `--verbose` restores the full header summary line and adds `## GitHub API usage`, including credential source labels, request counts, the latest authoritative quota state by resource, and exact measured GraphQL query cost. GraphQL mutations remain counted as unmeasured because GitHub exposes `rateLimit` only on the query root. Markdown is structurally different from JSON and does not guarantee field-for-field parity for unrelated action fields. Lean mode is the default because most fields are `false`/`0`/`[]` on a typical healthy tick and add context noise without value.

**Output shape (every action, default lean format):**

```
# PR #<N> [ACTION]

**status** `<…>` · **merge** `<…>`[ · **reviewDecision** `<…>`] · **state** `<…>` · **repo** `<…>`
**summary** <N> passing[, <N> skipped][, <N> filtered][, <N> inProgress][, <N> superseded][· **remainingSeconds** <N>][· **blockingBotReviewInProgress**][· **isDraft**][· **branch** behind PR base branch `<base>` | · **branch** conflicts with PR base branch `<base>`]
Approvals: <None|N[/M]> [Required|Not Required]
Conversations Resolved: <Yes|No> [Required|Not Required]
[Merge queue: <No|position N STATE> [Required|Not Required]]
[Stack: #<n> <pos>/<size> (base <ref>)]
[other required-only merge-rule lines]
[**ignored** `<check-name>`, …]
[**superseded** `<check-name>`, …]
[**activity** <N> commits · <N> review rounds[ · <N> review items since latest commit][ · active: `<check>`, …]]
[**merge queue** enabled `<bool>` · inQueue `<bool>`[ · state `<state>` · position `<N>`][ · checkCommit `<oid>`]]
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
- Recommendation: prefer non-GraphQL `gh` CLI commands for PR operations until the reset above, then resume pr-shepherd]

## Instructions

1. <numbered steps telling the agent exactly what to do>
```

Lean-mode rules for the summary line:

- Zero counts (`skipped`, `filtered`, `inProgress`, `superseded`) are omitted.
- `remainingSeconds` is shown only when the ready-delay timer is actively counting down (`status === "READY"` and `remainingSeconds > 0`).
- `blockingBotReviewInProgress` and `isDraft` are shown only when `true`.
- `shouldCancel` is never shown (it is fully implied by `action === "cancel"`).

**`ignored` line:** Emitted (in both Markdown and JSON as `ignoredNames`) only when at least one check matched the user's `ignoreChecks` config. Lists the suppressed check names. When present, these checks do not contribute to CI verdict, `inProgress` count, or stall detection. If GitHub's `mergeStateStatus` is `UNSTABLE` and all non-ignored checks pass, the PR is treated as `READY` (the same ready-state behaviour as `BLOCKED` with passing CI) — the ignored check's pending/failing state does not drive stall-timeout escalation.

**`superseded` line:** Emitted (in both Markdown and JSON as `supersededNames`) only when at least one `CANCELLED` check was superseded by a newer run of the same GitHub Actions workflow on the same commit — the concurrency-group eviction that happens when a new push (or a second trigger of the same push) cancels an in-flight run. These checks do not contribute to the CI verdict (`anyFailing`/`allPassed`) and never appear under `## Failing checks` — no action is needed; GitHub branch protection itself resolves required status checks by latest-run-per-name and will merge past them. A `CANCELLED` check with no newer same-workflow run present is **not** superseded — it still appears under `## Failing checks` with `[conclusion: CANCELLED]`, per the existing guidance there.

The `**branch**` segment is appended to the `**summary**` line on any action when `mergeStatus` is `"BEHIND"` or `"CONFLICTS"`. It surfaces the raw branch state so the agent can decide whether to rebase without further tool calls. `**reviewDecision**` is appended to the status line when the _derived_ merge status is `BLOCKED`.

After a sweep, iterate always prints `Approvals:` and `Conversations Resolved:` (current vs required). Extra merge-rule lines appear only when they apply (code-owner review, last-push approval, signed commits, linear history, branch up to date, required status checks, deployments, workflows, code scanning, merge queue, GitHub stacks). Tests that construct an iterate result without a sweep (no `mergeRequirements`) still get a fallback `**required**` line listing names from `requiredStatusCheckContexts`. Live iterate output uses `mergeRequirements` and does not emit that `**required**` line.

The agent should read the Approvals / Conversations Resolved lines instead of inferring a required review from `reviewDecision`. `REVIEW_REQUIRED` with `Approvals: None [Not Required]` means GitHub is not waiting on an approval.

`--verbose` restores the full summary line: all five counts, `remainingSeconds`, `blockingBotReviewInProgress`, `isDraft`, and `shouldCancel` always present.

**Note on `mergeStatus` in JSON lean mode.** The lean JSON projection (`--format=json`, default) emits `mergeStateStatus` (the raw GitHub value) but **omits the derived `mergeStatus` discriminator** (`CLEAN | BEHIND | CONFLICTS | BLOCKED | UNSTABLE | DRAFT | UNKNOWN`). Scripts that branch on `mergeStatus` must use `--verbose` to get the full `IterateResult`. `mergeStateStatus` is always present in both modes.

Load-bearing conventions (the iterate skill depends on these):

1. Line 1 is always an H1 heading of the form `# PR #<N> [<ACTION>]`. The action tag defines the recurrence boundary: `[FIX_CODE]` is always non-terminal and must be followed by another iteration, `[ESCALATE]` is the only human hand-off, and `[CANCEL]` is the ordinary terminal stop. The shipped skill's `--until-terminal` poll handles ordinary `WAIT`/`MARK_READY` actions itself; when it returns any other non-terminal result (including a quota-warning `WAIT`/`MARK_READY`), the skill follows `## Instructions` and re-invokes the canonical command. Within that boundary, behavior is driven by the `## Instructions` section, not by a separate skill dispatch table.
2. Lines 3–4 carry the base fields (status, merge, state, repo, summary). In lean mode, fields at their trivial default are omitted; `--verbose` restores the full scalar header/summary line in Markdown. JSON verbose mode returns the complete `IterateResult`, including fields not present in Markdown (for example, `baseBranch` and full `checks` entries on every action); Markdown is structurally lossy relative to JSON, and `--verbose` does not close that gap.
3. Every action ends with a `## Instructions` section — numbered `1.`, `2.`, … — that tells the agent exactly what to do. `## Instructions` remains the entry point and the skill needs no dispatch table of its own. Some steps are a one-line pointer naming an invariant procedure instead of inlining it (e.g. `See "CI failure triage" in the pr-shepherd skill`). The pointed-to `## Playbooks` section in the skill is fixed reference material, not per-tick policy — following `## Instructions` and applying the named playbook when pointed to it is still the whole dispatch story.
4. Under `[FIX_CODE]`, the `## Post-fix actions` section has an `` apply review: `<command>` `` bullet when GitHub's viewer capabilities authorize at least one review mutation (and an optional `resolve-only` bullet when applicable). The instructions reference those bullets so the skill strips backticks and runs the command.
5. In lean mode, passing check counts are surfaced only via the `**summary**` line — no per-check detail is emitted for passing checks. Failing check detail appears in `## Failing checks` within `[FIX_CODE]`, or under the escalation's items needing attention when check follow-up is unavailable. Lean JSON surfaces those rows as `fix.checks[]` or `escalate.checks[]`. In verbose mode, both JSON and Markdown also include the base `checks` data on every action; Markdown renders it under `## Checks`.

When a configured GraphQL quota threshold is crossed on a non-terminal result, lean Markdown and JSON include a `GitHub API quota warning` / `quotaWarning` block. The Markdown block includes `Recommended poll interval`, `Recommended bounded CLI timeout`, and a `Recommendation` line. The final instruction replaces the ordinary immediate continuation: it recommends switching to non-GraphQL `gh` CLI commands (e.g. `gh pr view`, `gh pr checks`, `gh pr review`, `gh api` REST endpoints) for PR operations, since GraphQL and REST draw from separate quota pools, and resuming pr-shepherd once the GraphQL quota resets (the block's `Reset` time). If the caller must keep polling before then, it falls back to a minimum poll interval: a bounded polling CLI command replaces existing `--interval` and `--timeout` flags; the shipped skill preserves `--until-terminal`, omits `--timeout`, and adjusts its cadence before re-invocation; a single-tick CLI, API, or MCP caller waits before its next tick instead. The warning is emitted once per worktree (or process session when no worktree is available) and quota window. It does not alter an active poll's timer; an unbounded `--until-terminal` poll returns the warning so its caller can restart with the recommended cadence. Terminal `cancel`/`escalate` results do not warn because no automated continuation is actionable; every `[FIX_CODE]` result remains eligible because it is non-terminal.

---

## `wait`

Nothing actionable to do; all CI is passing or in-progress.

**Trigger:** Fallthrough — no actionable work, no terminal state, not ready to mark, no ready-delay elapsed.

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

1. Non-terminal — no action needed this tick. Iterate again with the same options to continue.
```

The bare CLI command owns its bounded `--interval`/`--timeout` waits. A final `WAIT` returned at timeout is still non-terminal, so a direct caller decides when to start another bounded poll. The shipped skill's `--until-terminal` command instead continues ordinary `WAIT` actions internally; a quota warning can return `WAIT` so the skill can apply its cadence instructions before re-invoking. MCP `iterate` and `pr-shepherd iterate` return one tick and their caller schedules the next one. A `--ready-delay 15m` override remains a summary field rather than part of a rerun command; JSON carries the same value as `readyDelayOverride`.

The body line (`WAIT: …`) varies with the merge state — `branch is behind base`, unmet merge requirements (approvals, conversations, merge queue, …), `PR is a draft`, or `some checks are unstable`. After a sweep, iterate also prints current-vs-required merge rules so the agent can see _why_ GitHub is not mergeable (for example `Approvals: None [Not Required]` vs `Approvals: None [Required]`). Merge-queue and GitHub-stack membership appear as extra lines when they apply (`Merge queue: position 2 QUEUED [Required]`, `Stack: #7 2/3 (base main)`); they are omitted when the PR is not in a queue or stack and merge queue is not required.

**What the skill does:** Ordinary `WAIT` actions remain inside its `--until-terminal` poll. If a quota-warning `WAIT` is returned, follow `## Instructions`, adjust cadence, and re-invoke the canonical command. Direct MCP/`iterate` callers must reschedule themselves.

---

## `mark_ready`

Converts a draft PR to ready for review.

**Trigger:** All of: `status === "READY"`, `isDraft === true`, `!blockingBotReviewInProgress`, `config.actions.autoMarkReady` is enabled (disable with `--no-auto-mark-ready`), and ready-delay not elapsed (`readyState.shouldCancel === false`). Once the delay elapses, the action flips to `merge` with `--merge`, otherwise `cancel`. There is no extra `mergeStateStatus === "CLEAN"` check.

**CLI side-effects:** Calls the `markPullRequestReadyForReview` GraphQL mutation only when the same snapshot reports `viewerCanUpdate: true`. Otherwise iterate returns `authorization-required` with action `mark-ready` and performs no mutation.

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

1. The CLI marked the PR ready for review. Iterate again with the same options to continue.
```

**What the skill does:** Ordinary `MARK_READY` actions remain inside its `--until-terminal` poll. If a quota-warning `MARK_READY` is returned, follow `## Instructions`, adjust cadence, and re-invoke the canonical command. Direct MCP/`iterate` callers must reschedule themselves.

---

## `merge`

Emits an exact GitHub CLI command; Shepherd does not execute or wrap the merge operation.

**Trigger:** `--merge` is enabled and the clean READY state has lasted for the configured ready-delay. `--ready-delay 0` emits it immediately.

**Command modes:** Explicit merge intent is not gated by `viewerCanEnableAutoMerge`. An ordinary branch emits a head-pinned `gh pr merge <PR> --repo <owner/repo> --match-head-commit <head> --auto ...commandArgs` plus a plain-merge fallback command; a queue-required or queue-enabled branch (`mergeRequirements.mergeQueue.required` or `.enabled`) emits a head-pinned queue command (`mode: "queue"`) plus a `queueApiFallbackCommand` — a direct `enqueuePullRequest` GraphQL mutation — for the known gh CLI queue limitation. GitHub is authoritative: permission, branch-policy, and other execution failures are surfaced from the attempted command/API response.

Configured `merge.commandArgs` apply only to ordinary auto-merge commands. Every emitted command pins the expected PR head.

**Exit code:** 15.

After the caller runs an emitted auto-merge or queue command (or its fallback), iteration continues. An active auto-merge request or queue entry emits `WAIT` without ready-delay cancellation or generic stall escalation. Synthetic queue-commit `merge_group` failures emit `FIX_CODE` with their run/log context but no requeue command. Queue check contexts are fully paginated. A queue removal without an actionable failure emits `ESCALATE` with GitHub's raw reason, actor, time, queue commit, and parent commit IDs.

---

## `cancel`

Stops the iterate loop — no further iterations needed.

**Trigger:** Either the PR is merged or closed (`state !== "OPEN"`), or `--merge` is not enabled and the ready-delay timer elapsed after the current sweep still verifies the PR as a READY state. Candidate READY reports get a fresh mergeability read before the timer can complete, so newly detected conflicts route to `fix_code` instead of `cancel`.

**CLI side-effects:** Deletes any stale `ready-since.txt` marker when the PR is merged/closed or when ready-delay elapses.

**Exit code:** 0 for `reason: "merged"` or `reason: "ready-delay-elapsed"` — these are shepherd's two "finished cleanly" outcomes. 14 for `reason: "closed"` (closed without merging). See [exit-codes.md](exit-codes.md).

**`reason` field:** The result carries a structured `reason` discriminator — `"merged"`, `"closed"`, or `"ready-delay-elapsed"` — as a first-class field in both JSON and Markdown output. JSON consumers should branch on `reason` rather than parsing `log`.

**Markdown output:**

```markdown
# PR #42 [CANCEL] — merged

**status** `MERGED` · **merge** `UNKNOWN` · **state** `MERGED` · **repo** `owner/repo`
**summary** 0 passing

CANCEL: PR #42 is merged — stopping

## Instructions

1. Stop — the PR loop is complete. No further polling is needed.
```

Other heading variants: `# PR #42 [CANCEL] — closed`, `# PR #42 [CANCEL] — ready-delay-elapsed`.

Merged and closed PRs surface terminal top-level statuses (`MERGED` or `CLOSED`) because `runCheck` short-circuits before CI/comment processing. Other body-line variants: `CANCEL: PR #42 is closed — stopping`, `CANCEL: PR #42 has been ready for review — ready-delay elapsed, stopping`. When merge is still `BLOCKED` after the delay, the body uses a specific unmet-requirement note when one is known (`awaiting 1 approval`, `in merge queue position 2`, …) and otherwise `is awaiting human review or branch protection resolution` — it does not guess from `reviewDecision` alone.

**What the skill does:** Follow `## Instructions` — stop.

---

## `fix_code`

Actionable work exists — whether it requires code edits or only resolution is up to the agent.

**Trigger:** Any of: unresolved inline review threads, resolution-only inline review threads, actionable PR-level comments, `CHANGES_REQUESTED` reviews, a failing CI check with autonomous follow-up, a later-attempt workflow failure while the branch is behind its PR base, unseen check-run annotations on non-passing checks, merge conflicts (`mergeStatus.status === "CONFLICTS"`), or pending first-look review summary IDs to minimize. Failing checks of all types (timeout, cancelled, startup failure, actionable) enter check handling. The agent uses the included failed step, summary, and bounded log excerpt; when no nonblank log excerpt is included, or the check is CANCELLED/STARTUP_FAILURE, Shepherd emits a rerun recommendation (`[rerun authorized]` tag plus a `rerun:` command) when all of the following hold:

- the viewer's repository role grants Actions rerun capability (`repositoryPermission` is `WRITE`/`MAINTAIN`/`ADMIN` — this confirms the account's role, not the granular scope of whatever credential actually executes `gh`; an unauthorized rerun simply fails when run, the same residual risk as any other CLI-recommended git/gh mutation);
- GitHub reports `run_attempt === 1`; later attempts have consumed Shepherd's single rerun allowance, and unavailable attempt metadata is denied conservatively;
- the check's `runId` is confirmed to identify a GitHub Actions run — either fetched directly from the Actions REST API (a `STARTUP_FAILURE` check) or carrying a resolved `workflowName` (any other check) — rather than a coincidental number parsed from some other CI system's details URL;
- its conclusion is not `ACTION_REQUIRED` (the run is paused pending manual workflow approval, which a rerun cannot grant); and
- its run is not still in progress (a sibling job from the same run present in `report.checks.inProgress` — GitHub can only rerun a completed run).

External checks (no run ID) never get a rerun recommendation — they are not GitHub Actions runs. A non-empty external `detailsUrl` is nevertheless an autonomous investigation path, so the check remains `[FIX_CODE]`: the agent inspects the provider or reproduces the reported failure locally, applies any warranted fix, and iterates. A later workflow attempt (`runAttempt > 1`) also remains `[FIX_CODE]` when the PR branch is behind or conflicts with its base: Shepherd tells the agent to inspect the actual PR base branch for an existing fix, update the PR branch from that base according to repository conventions, push, and iterate again. The later attempt never receives another rerun command. Shepherd returns `[ESCALATE]` with trigger `check-follow-up-unavailable` only when every remaining failing check requires a human-only action or has neither a usable locator/evidence nor an authorized rerun or branch-refresh path, and no other autonomous work remains. If other autonomous work remains, the same tick stays `[FIX_CODE]`, surfaces all checks, and tells the agent to finish that work and iterate again; the unresolved manual-only blocker escalates on the next tick. That triage table lives in the pr-shepherd skill's "CI failure triage" playbook (see [`plugins/pr-shepherd/skills/pr-shepherd/SKILL.md`](../plugins/pr-shepherd/skills/pr-shepherd/SKILL.md)), keyed on the `[conclusion: …]` tag and `[rerun authorized]` tag each bullet already carries — see section 5 below. Unseen check annotations on skipped, ignored, or filtered CheckRuns also route here for one tick unless their conclusion is `SUCCESS`; they do not keep `fix_code` alive after the seen marker is written. A successful parent CheckRun is authoritative for iteration regardless of classification bucket, so its annotations remain visible in the current `check` output and are marked seen without triggering `FIX_CODE`.

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
3. If you changed code, commit any remaining changes and push to the PR head branch, then run the remaining review mutations using the pushed commit SHA and iterate again with the same options. If you did not change code, do not commit and continue.
4. When Shepherd emits journal guidance (only when `viewerCanUpdate === true`), append `- <decision>` for any substantial decision or rejection with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
5. Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an established Shepherd reply: a marked viewer-authored human thread is emitted resolve-only, while a marked other-human thread is already acknowledged and has no further mutation.
6. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)`, which must equal the current remote PR head. If you changed code, commit and push to the PR head branch first, then replace `$HEAD_SHA` with the pushed commit SHA.
7. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
8. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
9. `[FIX_CODE]` is non-terminal: if you changed code, commit and push to the PR head branch, then run the review mutations using the pushed commit SHA and iterate again with the same options; if you did not change code, complete the authorized review mutations and iterate again with the same options.
```

The CLI surfaces the raw `**branch**` state on the summary line and leaves rebase/commit mechanics to the caller. Push access to the PR head is a usage precondition: do not start pr-shepherd when the calling agent cannot push the branch. Raw GitHub fields such as `viewerCanEditFiles` and `headRepositoryPermission` remain useful context, but they do not gate `[FIX_CODE]`, suppress review mutations, or create a hand-off. Conflict and code-change ticks instruct the caller to commit, push, complete SHA-gated review mutations, and iterate again. `[FIX_CODE]` is always non-terminal; only `[ESCALATE]` hands work to a human.

`$HEAD_SHA`/`$DISMISS_MESSAGE` substitution stays a CLI step — conditional on `resolveCommand.requiresHeadSha`/`requiresDismissMessage`/`replyThreadIds` as before — because the printed `apply review:` command is syntactically invalid without the placeholders. The CLI itself recognizes a Shepherd reply only when the latest comment begins `<!-- pr-shepherd -->`; author equality is not enough. Thus an unmarked human comment from the authenticated viewer is feedback and is emitted for ordered reply-and-resolve, while a marked viewer-authored thread is emitted resolve-only for retry. A marked other-human thread is already acknowledged and is suppressed from further mutation. A standalone CLI caller who never loads the skill still gets a command that is safe to run as printed. Only dismiss-ID retention (omitting a `--dismiss-review-ids` ID leaves the PR stuck in `CHANGES_REQUESTED`) and the first-look/annotation ID-exclusion rules moved to the pr-shepherd skill's `## Playbooks` section (see [`plugins/pr-shepherd/skills/pr-shepherd/SKILL.md`](../plugins/pr-shepherd/skills/pr-shepherd/SKILL.md)) — those only matter if the caller _edits_ the printed command, which the printed command run unmodified never requires. Shepherd Journal citation conventions moved the same way. Bare, external, CANCELLED, STARTUP_FAILURE, and GitHub Actions failures with no nonblank included log excerpt either stay in `[FIX_CODE]` while other autonomous work remains or return `[ESCALATE]` with `check-follow-up-unavailable` when they are the only blocker.

When `mergeStatus` is `"BEHIND"` and [`iterate.behindBaseHint`](configuration.md#iteratebehindbasehint--default-) is configured (empty by default), an extra instruction appears immediately before commit/push finalization: `` `The branch is behind PR base branch `<base>`. <hint> before pushing.` ``. The CLI still never chooses the mechanics; it only echoes the configured hint.

When a later workflow attempt is still failing and the branch is `BEHIND` or `CONFLICTS`, `## Instructions` names the actual PR base branch and tells the caller to inspect it for an existing fix before choosing a remediation. A second step tells the caller to rebase or otherwise update from that base according to repository conventions; conflict output includes conflict resolution as part of that update. Behind-branch output then explicitly requires pushing the updated PR head before iterating. Configured `iterate.behindBaseHint` text remains an additional repository-specific pointer.

When one or more threads carry a `[suggestion]` marker, `## Instructions` adds one triage step pointing at the retrieve/apply command; the refusal and drift mechanics are invariant text that lives in the pr-shepherd skill's "Suggestion patches" playbook instead of being spelled out per tick:

```markdown
## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. For all threads marked `[suggestion]` under `## Review threads`, run one `pr-shepherd build-suggestion-patches https://github.com/owner/repo/pull/42 --thread-id <id> --message "<one-sentence headline>" --format=json` command, repeating the `--thread-id <id> --message <one-sentence headline>` group in displayed order, then apply the returned patches in order. See "Suggestion patches" in the pr-shepherd skill for refusals and drift.
3. Apply every warranted review fix in each file referenced above.
4. [remaining remediation, finalization, mutation, and recurrence steps]
```

The `build-suggestion-patches` step is absent when no thread has a `[suggestion]` marker.

The review-fix step says "each file referenced above" only when `## Review threads` is present. With actionable comments alone, it says "the relevant files" because comments have no file location.

**Section order:**

1. Heading + base fields (always present).
2. `## Review threads` — active unresolved threads. Human-authored active threads are marker-gated: a previously seen thread whose transcript changed is rendered again with `[edited since first look]`, while unchanged seen human threads are suppressed until markers are cleared. GitHub-detected bots and logins in top-level `botUsernames` are returned every tick until resolved, even when unchanged. After evaluating each thread, the agent runs every generated review-mutation command even when no code change is warranted: bot/non-human IDs remain in `--resolve-thread-ids`; a human thread whose original inline comment has `viewerDidAuthor: true` and whose latest comment is unmarked appears in both `--reply-thread-ids` and `--resolve-thread-ids`; unmarked other-human IDs remain reply-only. A marker-ended other-human thread is already acknowledged and is suppressed from further mutation. Each thread appears under ``### `threadId=<id>` — <loc> (@author[ · <authorType>][ · <authorAssociation>][ · viewer-authored]) [reviewId=<id>]? [suggestion]?`` (or a linked `threadId` when a URL is available), where `viewer-authored` is rendered only when `viewerDidAuthor: true`, and `<loc>` is `` `path:line` `` for single-line threads or `` `path:startLine-endLine` `` for multi-line threads. The thread's full comment transcript follows, with each comment/reply rendered under ``#### `commentId=<id>` (@author[ · <authorType>][ · <authorAssociation>][ · viewer-authored])`` (or linked when a comment URL is available) and the full body as a `>` blockquote. Multi-paragraph bodies preserve empty lines as `>` lines. Threads with a ` ```suggestion ` fence in the top comment carry a `[suggestion]` tag in the thread heading and a `Replaces lines …` block after the transcript showing the parsed replacement.
3. `## Review threads to resolve` — unresolved outdated/minimized inline threads plus active marker-ended viewer-authored human threads; none require code edits unless the agent chooses to act on the body. Seen markers suppress repeated first-look/body display but do not remove these threads from this section or from generated resolve arguments while GitHub still reports `isResolved: false`. A viewer-authored human ID whose latest comment is unmarked is paired in `--reply-thread-ids` and `--resolve-thread-ids`; if that latest comment begins `<!-- pr-shepherd -->`, it is resolve-only so a previous reply can be retried without duplication. Unmarked other-human IDs are reply-only. Marker-ended other-human threads are already acknowledged and do not appear for further mutation. Bot/non-human IDs are passed to `--resolve-thread-ids`.
4. `## Actionable comments` — same H3-plus-blockquote shape as threads minus the `<loc>`: ``### `commentId=<id>` `` or `### [commentId=<id>](<url>)` when a URL is available. Non-auto-minimized comments that were previously surfaced and whose body changed are rendered with `[edited since first look]` on the heading; their marker hash is updated after display so unchanged future runs suppress them again.
5. `## Failing checks` — one bullet per failing check. Shape varies by locator:
   - ``- `<runId>` — `<workflowName> › <jobName>` `` for GitHub Actions checks (`workflowName ›` prefix omitted when unavailable; `jobName` falls back to the check name when absent).
   - ``- external `<detailsUrl>` — `<name>` `` for external status checks (codecov, vercel, etc.) with null `runId` but a URL.
   - ``- (no runId) — `<name>` `` when both are null.

   Every bullet carries a `[conclusion: <CONCLUSION>]` tag (e.g. `[conclusion: FAILURE]`, `[conclusion: TIMED_OUT]`, `[conclusion: CANCELLED]`, `[conclusion: STARTUP_FAILURE]`); null conclusions produce no tag. Attempts after the original carry `[attempt: N]`; attempt 1 is omitted as the trivial default. A check carries a `[rerun authorized]` tag when it meets every eligibility condition listed under `fix_code`'s **Trigger** above (WRITE+ role, confirmed Actions provenance, `run_attempt === 1`, not `ACTION_REQUIRED`, not still in progress). The first bullet for a given `runId` additionally carries a rerun sub-line with `gh run rerun <runId> -R <owner/repo>`; later bullets sharing that same `runId` (matrix jobs from one run) carry the `[rerun authorized]` tag but omit the repeated command line, since one rerun covers all of them. External checks (no run ID) never carry this tag. Non-CANCELLED bullets may also carry a `> <failedStep>` blockquote line (the first step that failed, GitHub Actions only), a `> <summary>` blockquote line (one-line status text from the GitHub UI), and a bounded `> <logExcerpt>` blockquote from the matched failed job log. For aggregate jobs that print `Job results`, `logExcerpt` is condensed to non-success job results plus the exit-code/error line; otherwise it is a bounded raw excerpt. All three are omitted when not available.

   The numbered instructions emit one triage pointer whenever any check has a run ID or a `detailsUrl` — "Triage every failure under `## Failing checks`. See 'CI failure triage' in the pr-shepherd skill for inspection rules." — plus a second pointer to the same playbook whenever any check carries `[rerun authorized]`. The playbook uses only evidence already included in the output and never recommends cancellation without an exact capability; a rerun is recommended only when `[rerun authorized]` is present. External checks with a non-empty URL remain `[FIX_CODE]` because that URL is an autonomous inspection path. Later-attempt failures stay `[FIX_CODE]` without another rerun command while a behind/conflicting branch provides the branch-refresh path described above. Bare checks, CANCELLED/STARTUP_FAILURE checks, `ACTION_REQUIRED` checks, and GitHub Actions failures without a nonblank log excerpt require manual follow-up when they have no authorized rerun. They appear under `[FIX_CODE]` only while other autonomous work remains: the agent completes that work and iterates again. When those checks are the only remaining blockers, Shepherd returns `[ESCALATE]` with trigger `check-follow-up-unavailable`. They never make a `[FIX_CODE]` completion terminal.

6. `## Check annotations` — inline annotations attached to completed non-passing `CheckRun` checks (failing, skipped, ignored, or filtered), grouped by the same check locator used in `## Failing checks`. Each bullet includes the marker-gated annotation ID (`check_annotation_…`), optional blob link, file range, raw annotation level, optional title, bounded message blockquote, and optional bounded raw details blockquote. In-progress checks are not fetched. Each annotation is surfaced once per PR through the seen-marker store and does not add any resolve/minimize mutation ID. After that tick the annotation is omitted from later output. Not emitted when empty. When this section is present without any failing conclusions, `## Failing checks` is omitted.
7. `## Changes-requested reviews` — `CHANGES_REQUESTED` reviews. **Human-authored CRs are marker-gated**: each entry is emitted once, then suppressed until the body changes. Edited reviews are emitted again with `edited: true` in JSON. Human CRs are never auto-dismissed — the reviewer must re-review or dismiss themselves. **Authorized bot/non-human CRs** (`authorType` is `Bot`, `Unknown`, or a `[bot]`-suffix login, or a login in `botUsernames`, with `viewerCanAdminister: true`) bypass the marker gate: they are emitted on every tick until they leave `CHANGES_REQUESTED`. The first emission renders the full body; subsequent ticks render a terse one-line reminder carrying `staleBotCr: true`. Their IDs remain in `--dismiss-review-ids`, so the agent can recover a dropped dismissal; an unchanged authorized review that outlives `iterate.stallTimeoutMinutes` triggers `bot-cr-not-dismissed`. **Unauthorized or unverifiable bot CR dismissals** are surfaced once, omitted from mutation commands, and then marker-gated until edited; they never trigger `authorization-required` or `bot-cr-not-dismissed`. **Stale CR detection** — a review is marked `staleReview: true` in JSON when its `commit.oid` differs from `headRefOid` AND every associated review thread (matched by `thread.reviewId === review.id`) is `isResolved || isOutdated`. Reviews with no associated threads are treated conservatively and are NOT marked stale. **Stale bot CRs** follow the same authorization routing and gain a `[stale — review is on an old commit, all threads resolved]` tag in text output. **Stale human CRs** carry a `[stale — review is on an old commit, all threads resolved; ask reviewer to re-review or dismiss]` tag and are never added to `--dismiss-review-ids`; do not treat them as fresh feedback requiring code changes.
8. `## Review summaries (first look)` — `COMMENTED` review summaries the agent has **not yet seen**. Each entry is rendered with an H3 heading (``### `reviewId=<id>` (@<author>[ · <authorType>][ · <authorAssociation>])``) and the full body as a `>` blockquote. Non-human IDs eligible under `iterate.minimizeComments` are included in `--minimize-comment-ids` only when every known inline child thread from that same review is resolved; human IDs are surfaced once, marked seen, and never minimized. Not emitted when empty.
9. `## Review summaries (edited since first look — already minimized; do not re-minimize)` — `COMMENTED` review summaries whose body was edited by the author after Shepherd last surfaced them. Each entry is rendered the same way as section 8 (H3 heading + `>` blockquote). These IDs are **NOT** included in `--minimize-comment-ids` — the review is already minimized on GitHub (or was in a prior iteration's minimize queue). Read the updated body and record any Shepherd Journal note, but do not pass these IDs to any mutation flag. The seen-marker hash is updated after display so the next run only re-surfaces them if the body changes again. Not emitted when empty.
10. `## Review IDs to minimize queue` — backticked review IDs (`PRR_…`) queued for `--minimize-comment-ids` that are not first-look bodies. Eligible non-human `COMMENTED` review summaries whose bodies were surfaced in a **prior** iteration are minimized in-process (see `## fix_code` CLI side-effects above) and never reach this section — unless GitHub does not confirm that in-process mutation (null/error/rate-limit), in which case the ID falls back here so the `apply review` command stays a working retry path. What else remains here: classification-rule `autoResolve` review-summary IDs not consumed by `actions.autoMinimizeSuppressed`, and — when `iterate.minimizeApprovals` is `true` — matching non-human `APPROVED` review IDs queued for minimization even though their bodies were not previously surfaced. A suppressed rule-matched summary without `viewerCanMinimize: true` returns to the normal first-look/edited visibility gate and never enters this queue. All IDs from sections 8 and 10 that pass the policy are merged into `--minimize-comment-ids` in the `apply review` command. Not emitted when empty (the common case, since most seen COMMENTED summaries are minimized before this section is built).
11. `## Approvals (surfaced — not minimized)` — emitted for `APPROVED`-state reviews that are not routed to `--minimize-comment-ids` (including the default `iterate.minimizeApprovals: false`, human approvals, non-human approvals excluded by `iterate.minimizeComments`, or items without `viewerCanMinimize: true`). H3 heading uses `` `reviewId=<id>` `` (same prefix scheme as other item types); body is a `>` blockquote or `(no review body)` when empty. An authorization-denied item is tagged `[viewer cannot minimize]`, produces no minimize flag, and is marker-gated after its one-time visibility tick. Surfaced approvals are never included in `--minimize-comment-ids` and do not count as autonomous work that postpones a `check-follow-up-unavailable` escalation.
12. `## First-look items (N) — acknowledge status before acting` — threads and PR comments that are outdated, resolved, or minimized and have not yet been acknowledged by the agent. Emitted on first encounter only; a per-item seen-marker file (`src/state/seen-comments.mts`) suppresses them on subsequent runs. Each bullet carries a `[status: …]` tag: `outdated`, `resolved`, or `minimized`. If a thread transcript or comment body was edited since the item was first acknowledged, the tag gains an `, edited` suffix (e.g. `[status: minimized, edited]`). Thread bullets include the full comment transcript and links so a reply to a resolved thread gives the agent enough context to view or act on the entire thread again. If a first-look human thread also appears under `## Review threads to resolve`, its ID follows the same viewer/marker and authorization routing as the section above; marker-ended other-human threads are already acknowledged and do not appear for mutation. Otherwise, do not pass first-look-only IDs to mutation flags. Active unresolved threads are marker-gated under `## Review threads`, not duplicated here. Not emitted when empty.
13. `## In-progress runs` — reserved for compatibility and currently omitted. GitHub exposes no exact viewer capability for workflow-run cancellation.
14. `## Protected runs` — reserved for compatibility and currently omitted because Shepherd does not cancel workflow runs.
15. `## Cancelled runs` — reserved for compatibility and currently omitted.
16. `## Post-fix actions`:
    - ``- base: `<branch>` `` — raw PR base branch context.
    - ``- resolve-only: `<argv>` `` — present when authorized standalone resolve/minimize mutations are split from a message-bearing command, including authorized marker-ended viewer-authored retry resolves. Its instruction appears before `apply review:` and requires no substitutions. Omitted when all mutations are combined into one command.
    - ``- apply review: `<argv>` `` — fully quoted apply command containing IDs selected by iterate's raw-capability and semantic routing. Human replies require `viewerCanReply`; every resolve requires `viewerCanResolve`; minimization requires `viewerCanMinimize`; dismissal conservatively requires `repository.viewerCanAdminister`. Viewer-authored human resolution retains the reply/marker routing described above. Direct `apply review` honors the emitted request without a second authorization preflight and surfaces GitHub's result.
17. `## Instructions` — numbered list to execute in order. When a `resolve-only:` bullet is present, a `Run the resolve-only: command` step precedes the `Run the apply review: command` step. The instructions reference the command bullets by name rather than duplicating them — that single source of truth is what the skill executes.

The JSON payload exposes the same data under `fix.{threads, resolutionOnlyThreads, actionableComments, reviewSummaryIds, firstLookSummaries, editedSummaries, surfacedApprovals, checks, changesRequestedReviews, resolveCommand, resolveOnlyCommand, instructions, firstLookThreads, firstLookComments, inProgressRunIds, protectedRuns}` plus top-level `baseBranch`, `branchProtection` (on `IterateResultBase`, not under `fix`; omitted in lean JSON when `null`, always present in verbose JSON), and `cancelled`.

Comment/review/thread objects include `authorType` (`User`, `Bot`, or `Unknown`) and the raw GitHub `authorAssociation` when available. Inline thread objects and transcript comments additionally expose `viewerDidAuthor: true` only when GitHub says the authenticated viewer authored them; text author labels append `viewer-authored` for the same true-only signal. These values are provenance, not a trusted/untrusted classification. For routing, only the original inline comment's `viewerDidAuthor` grants the narrow viewer-owned human exception; it does not make an unmarked latest comment a Shepherd reply. Thread objects keep top-comment fields (`body`, `author`, `url`) and include `comments[]` with the full thread transcript. `fix.actionableComments[]` includes `edited: true` when a non-auto-minimized PR comment body changed after Shepherd previously surfaced it. `fix.changesRequestedReviews[]` items include `commitOid` (the commit the review was made against) when available, and `staleReview: true` when the review is stale (commit behind HEAD, all threads resolved/outdated). In lean JSON mode, optional fields are omitted when unavailable.

Generated iterate commands and automatic side effects are capability-aware. GitHub's per-object raw fields (`viewerCanMinimize`, `viewerCanReply`, `viewerCanResolve`) and PR/repository viewer fields (`viewerCanUpdate`, `viewerCanEnableAutoMerge`, `viewerCanAdminister`, `viewerPermission`) are fetched in the same snapshot. Missing capability data is treated as unverifiable and denied for generated actions. Denied or unverifiable generated review replies, thread resolutions, bot-review dismissals, and cosmetic minimizations remain visible through the seen-marker gate for one tick but produce no command; unchanged items are skipped on later ticks and excluded from fix-thrash accounting. Direct `apply review` does not repeat authorization checks or return authorization-skipped arrays; it attempts the requested mutations and surfaces GitHub's per-operation results. Explicit merge/enqueue requests likewise rely on GitHub's response.

Generated journal guidance remains capability-filtered, but direct `apply journal` attempts the requested PR-body update regardless of `viewerCanUpdate` and surfaces GitHub's result. `apply files` performs the requested `markFileAsViewed` mutations and surfaces marked, already-viewed, missing, failed, and rate-limited results from GitHub.

`fix.checks[]` includes `logExcerpt` when Shepherd fetched a bounded raw excerpt from the matched failed job log and `runAttempt` when GitHub reports an attempt later than 1. `fix.checks[]` also includes skipped, ignored, or filtered CheckRuns that still have unseen annotations; those rows carry `annotationOnly: true` and are omitted from `## Failing checks` and from failing-check rerun/`--require-sha` gating. Passing CheckRuns and their annotations remain available in `check` output but are not projected into `FIX_CODE`. `fix.checks[].annotations[]` contains marker-gated annotations: `{ id, path, startLine, endLine, startColumn?, endColumn?, level, title?, message, rawDetails?, blobUrl? }`. Annotation `message` and `rawDetails` values are capped independently before rendering or JSON projection. Seen annotations are not re-emitted.

`fix.inProgressRunIds` and `cancelled` remain empty. GitHub exposes no exact viewer capability for workflow-run cancellation, so neither Markdown nor JSON recommends it, regardless of repository role.

`fix.checks[].rerunCommand` is present only when a check meets every rerun-eligibility condition listed under `fix_code`'s **Trigger** above, including `run_attempt === 1`; JSON carries it on every eligible check (not deduplicated), while Markdown prints the `rerun:` sub-line once per distinct `runId` — see section 5. Shepherd never runs the rerun itself — the CLI only recommends the `gh run rerun` command for the agent to execute, matching the `commit-suggestion` pattern used elsewhere for git mutations.

`fix.protectedRuns` remains empty because Shepherd does not cancel workflow runs.

`branchProtection` is `null` when no branch protection rule applies; otherwise it carries GitHub's raw rule values. `resolutionOnlyThreads` contains unresolved outdated/minimized review threads plus active marker-ended viewer-authored human retry threads. For human threads, an unmarked viewer-authored original comment is paired in reply and resolve flags only when both capabilities are true; a marked viewer-authored retry needs `viewerCanResolve: true`; an unmarked other-human thread remains reply-only with `viewerCanReply: true`; and a marker-ended other-human thread is already acknowledged. Bot/non-human IDs require `viewerCanResolve: true`. An authorized outdated detected/configured-bot thread remains in `resolutionOnlyThreads` and is emitted under `--resolve-thread-ids` even when GitHub clears its path or line; this mutation needs neither a reply nor a SHA. Other threads without a path/line, and threads missing any required reply/resolve capability, are surfaced once, omitted from mutation and attempt accounting, then marker-gated until edited. `reviewSummaryIds` contains only policy-eligible non-human review IDs with `viewerCanMinimize: true`. Denied cosmetic comments and summaries are still surfaced once and after edits, then marker-gated without a mutation command.

`firstLookSummaries` carries the full `Review` objects for bodies seen this iteration for the first time. `editedSummaries` carries the full `Review` objects for summaries whose body changed since last seen — these IDs are **NOT** in `reviewSummaryIds`. `changesRequestedReviews` and `surfacedApprovals` are also marker-gated: unchanged review bodies are suppressed, edited bodies re-surface. `resolveCommand.argv` starts with `["pr-shepherd", …]`. `fix.resolveOnlyCommand` is present when resolve-thread and minimize-comment mutations are split from the reply command, including a marker-ended viewer-authored human retry; it carries `requiresHeadSha: false` and no `$DISMISS_MESSAGE` placeholder. In lean JSON mode, `fix.*` arrays that are empty are omitted; `cancelled` is omitted when empty; `resolveOnlyCommand` is omitted when not present. Pass `--verbose` to include all fields. `firstLookThreads` and `firstLookComments` are informational unless the same thread appears in `resolutionOnlyThreads`.

For `escalate`, `escalate.stalledChecks[]` is emitted when unstarted CI caused `stall-timeout`; each entry includes `name`, raw `status`, `source`, `runId`, `detailsUrl`, `ageSeconds`, and any available `createdAtUnix`, `startedAtUnix`, `updatedAtUnix`, and `summary`. A `check-follow-up-unavailable` escalation emits `escalate.checks[]` with the same raw check fields and bounded annotations used by `fix.checks[]`; Markdown renders their run or external source, workflow/job, conclusion, scope/commit, failed step, summary, log excerpt, rerun command when present, and annotations. A merge-queue removal escalation also emits `escalate.mergeQueueRemoval` with `createdAtUnix` plus any available raw `reason`, `actor`, `beforeCommitOid`, and `beforeCommitParentOids`.

**Resolve command rules (same in Markdown and JSON):**

- A leading `<!-- pr-shepherd -->` in the latest visible comment is the only signal for a prior Shepherd reply; author equality is not sufficient. The generated command does not re-reply to a marked thread. An unmarked viewer-authored human thread may appear in both reply and resolve flags, while direct unmarked human resolve without that paired reply is skipped. A marked other-human thread is already acknowledged and is omitted from further mutation.
- `--require-sha "$HEAD_SHA"` is appended to the `apply review:` command when it contains `--reply-thread-ids` following actionable thread fixes, when failing checks are being addressed, or whenever `--dismiss-review-ids` is present (dismissal is a post-push operation that must race-check against a moving HEAD). The `resolve-only:` command (bot/non-human mutations and marker-ended viewer-owned retry resolves) never carries `--require-sha` — run it independently of any SHA check.
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

- **`stall-timeout`** — the iterate result has not materially changed for `config.iterate.stallTimeoutMinutes` minutes (default 60), or a relevant CI check/status context has stayed pending without starting for that long. Catches loops where the same failing test, transient error, or pending state repeats indefinitely without progress. The generic timer resets whenever the HEAD SHA, failing-check set, or actionable item IDs change. Override with `--stall-timeout <duration>` — a bare number is minutes (e.g. `--stall-timeout 90`), or use an explicit `s`/`m`/`h` suffix (e.g. `--stall-timeout 90s`, `--stall-timeout 1h`); `--stall-timeout 0` disables. The escalation message renders the elapsed time in whatever unit reads best (seconds, minutes, or hours), independent of the flag's input unit.
- **`fix-thrash`** — same retryable, located active thread body dispatched ≥ `config.iterate.fixAttemptsPerThread` times (default 3) without resolving or changing. This is a manual handoff: automated fixes pause. Threads suppressed by seen markers, location-independent outdated-bot resolutions, other threads without a path/line, and threads with unauthorized required mutations do not count; edited thread bodies reset the per-thread attempt count.
- **`base-branch-unknown`** — the GraphQL batch did not yield a usable base branch name: the derived value was empty or contained unsafe characters. Preempts any `[FIX_CODE]` that would require a push, since rebasing onto the wrong base is worse than pausing iteration.
- **`bot-cr-not-dismissed`** — an authorized bot/non-human `CHANGES_REQUESTED` dismissal was emitted but the review remained undismissed for `config.iterate.stallTimeoutMinutes`. A stale entry means the agent dropped or failed to complete the emitted `--dismiss-review-ids` mutation. Unauthorized dismissals are surfaced once and skipped, so they cannot trigger this escalation.
- **`authorization-required`** — automatic mark-ready was selected for a draft PR but `viewerCanUpdate` was denied or unverifiable. Explicit merge/enqueue, review, journal, and file-view requests surface GitHub's actual mutation result instead. Review replies, thread resolutions, bot-review dismissals, and pushes never use this trigger.
- **`check-follow-up-unavailable`** — no other autonomous work remains, and every failing check either is a later workflow attempt after Shepherd's single rerun allowance was consumed, requires a human-only action (`ACTION_REQUIRED`), is `CANCELLED`/`STARTUP_FAILURE` without an authorized rerun, is a GitHub Actions failure with no nonblank included log excerpt and no authorized rerun, or is truly bare (no run ID and no non-empty details URL). A later attempt hands off even when a log excerpt exists; the escalation preserves that evidence. A non-empty external details URL is actionable and never triggers this escalation by itself. `escalate.checks[]` preserves the raw check details for the human.
- **`merge-queue-removed`** — the latest queue removal is newer than the latest enqueue and no queue-commit failure or other actionable work gives the agent concrete remediation. Failing queue CI stays `FIX_CODE`. The result includes GitHub's raw reason, actor, timestamp, and queue commit for the human decision.

The closed seven-trigger list and full predicates are in [`docs/escalations.md`](escalations.md).

**CLI side-effects:** None.

**Exit code:** 13

**Markdown output:**

```markdown
# PR #42 [ESCALATE]

**status** `UNRESOLVED_COMMENTS` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `fix-thrash`

Same thread(s) reached the automated attempt limit — treat this as a manual handoff. Apply the fix by hand.

## Items needing attention

- thread `PRRT_kwDOSGizTs58XB1L` — `src/commands/iterate/index.mts:42` (@alice): The variable name is misleading

## Fix attempts

- thread `PRRT_kwDOSGizTs58XB1L` attempted 3 times

---

After completing manual fixes, resume only after every required remote update has been performed by a credential whose push authorization was established outside Shepherd; then rerun `/pr-shepherd:pr-shepherd 42`.

## Instructions

1. Stop — human direction is required before automated polling can resume.
```

The block after the base-fields line (separated by a blank line) is `escalate.humanMessage` in JSON — ready to print verbatim.

**What the skill does:** Follow `## Instructions` — stop.

---

## Classification rules

Drop `.ts`, `.mts`, `.mjs`, or `.js` files under `.pr-shepherd/classification/` to suppress bot-noise items and/or queue them for automatic resolution, without any agent involvement.

Each file must have a default export matching:

```ts
import type { ClassifyRule } from "pr-shepherd/classify";
export default function rule(item: ClassifyItem): ClassifyAction | null {}
```

The `ClassifyItem` union covers four kinds: `"review-thread"`, `"pr-comment"`, `"review-summary"`, and `"changes-requested"`. Each item carries `id`, `author`, `authorType`, optional raw GitHub `authorAssociation`, `body`, and (for threads) `path`. Association values are context only; rules decide how, if at all, to use them.

`ClassifyAction` has two optional boolean flags:

- `suppress: true` — hides the item from agent output; the seen marker is still written so the item does not re-surface as first-look on the next tick.
- `autoResolve: true` — routes the item's ID into the resolve/minimize mutation: threads go to `--resolve-thread-ids`, PR comments and review summaries go to `--minimize-comment-ids`. When combined with `suppress: true`, Shepherd performs the mutation silently by default via `actions.autoMinimizeSuppressed` and only falls back to the generated `apply review` command if the mutation fails. Not supported for `"changes-requested"` items (dismissing a review requires an explicit message).

Rules from multiple files combine permissively: `suppress` and `autoResolve` are OR'd across all matching rules for a given item.

Files starting with `_` or `.` are ignored. The loader walks up from `cwd` looking for `.pr-shepherd/classification/`, stopping at the home directory. Unlike `.pr-shepherdrc.yml`, only the first classification directory found is used. TypeScript rule files (`.ts` / `.mts`) are loaded by the runtime's native TypeScript support, so keep them to erasable syntax such as type annotations and `import type`. Runtime TypeScript features that need transpilation, such as enums, namespaces, parameter properties, and decorators, are not supported. Use `.mts` for portable ESM rules across Node, Bun, and Deno.

Example rules for common bot-noise patterns are in [`examples/classification/`](../examples/classification/).
