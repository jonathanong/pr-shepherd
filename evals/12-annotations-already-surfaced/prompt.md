---
model: claude-opus-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [fix-code, complex, efficiency]
append_system_prompt: |
  You have no shell, no network access, and no repository checkout in this
  environment. Do not attempt to run shell commands, read repository files, or
  fetch anything over the network, and do not ask for the repository to be
  provided.

  You MAY use any skill available to you. If a skill is relevant to this request,
  load it before you plan.

  State the plan you would execute, as concrete numbered steps that someone could
  follow without you. Where a step runs a command, give the exact command. Where
  you decide NOT to take an action that the output appears to offer, say so
  explicitly and say why.
---
Shepherd https://github.com/owner/repo/pull/42 through to a terminal state. I already ran the first tick —
here is what it returned. Take it from there.

---

# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_with_annotations](https://github.com/owner/repo/pull/42#discussion_r55) — `src/util/parse.ts:18` (@reviewer · User)

> Same edge case the analyzer flagged — please handle empty input.

## Failing checks

- external `https://checks.example/code-quality` — `Code Quality` [conclusion: FAILURE]
  > 1 annotation

## Check annotations

### external `https://checks.example/code-quality` — `Code Quality`

- `check_annotation_5501` [↗](https://github.com/owner/repo/blob/abc123/src/util/parse.ts#L18) `src/util/parse.ts:18` [FAILURE] — Unhandled edge case
> Empty input is not handled before indexing.

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_with_annotations --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads`, `## Failing checks`, `## Check annotations` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for read-only inspection rules.
4. Inspect every referenced range under `## Check annotations` and apply any warranted change.
5. If you changed code, commit any remaining changes and push to the PR head branch, then run the remaining review mutations using the pushed commit SHA and iterate immediately with the same options. If you did not change code, do not commit and continue with the remaining steps.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
7. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)`, which must equal the current remote PR head. If you changed code, commit and push to the PR head branch first, then replace `$HEAD_SHA` with the pushed commit SHA.
8. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
9. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
10. `[FIX_CODE]` is non-terminal: if you changed code, commit and push to the PR head branch, then run the review mutations using the pushed commit SHA and iterate immediately with the same options; if you did not change code, complete the authorized review mutations and iterate immediately with the same options.
