---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [fix-code, complex, efficiency, tier:guard]
append_system_prompt: |
  You have no shell and no network access. Do not run shell commands, fetch
  anything over the network, or read repository files other than a reference
  file linked from a skill you loaded. Do not ask for the repository to be provided.

  You MAY use any skill available to you. If a skill is relevant to this request,
  load it before you plan. If that skill points at a reference file, read it
  before you plan.

  State the plan you would execute, as concrete numbered steps that someone could
  follow without you. Where a step runs a command, give the exact command. Where
  you decide NOT to take an action that the output appears to offer, say so
  explicitly and say why.
---
Shepherd https://github.com/owner/repo/pull/42 through to a terminal state. I already ran the first tick —
here is what it returned. Take it from there.

---

# PR #42 [FIX_CODE]

**status** `FAILING`

## Review threads

### [threadId=PRRT_with_annotations](https://github.com/owner/repo/pull/42#discussion_r55) — `src/util/parse.ts:18` (@reviewer)

> Same edge case the analyzer flagged — please handle empty input.

## Failing checks

- external `https://checks.example/code-quality` — `Code Quality` [conclusion: FAILURE]
  > 1 annotation

## Check annotations

### external `https://checks.example/code-quality` — `Code Quality`

- `check_annotation_5501` [↗](https://github.com/owner/repo/blob/abc123/src/util/parse.ts#L18) `src/util/parse.ts:18` [FAILURE] — Unhandled edge case
> Empty input is not handled before indexing.

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Inspect every referenced range under `## Check annotations` and apply any warranted change.
4. Commit and push any changes.
5. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
6. Set `$DISMISS_MESSAGE` to a one-line outcome; run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_with_annotations --message "$DISMISS_MESSAGE" --require-sha HEAD`
7. Rerun this command now.
