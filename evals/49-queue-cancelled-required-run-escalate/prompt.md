---
model: claude-sonnet-5-5
runs: 6
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [investigate, merge-queue, ci-triage, tier:guard, area:github]
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
  explicitly and say why. The plan is the deliverable: do not ask for a shell or
  for command output to be pasted back.
---
Shepherd https://github.com/owner/repo/pull/42 and merge it. I already ran the first tick
(`pr-shepherd https://github.com/owner/repo/pull/42 --until-terminal --merge`) — here is what it returned.
Take it from there.

---

# PR #42 [TRIAGE]

**status** `FAILING` · **repo** `owner/repo`
**summary** 2 passing
Required status checks: web [Required]
Merge queue: No [Required]
**merge queue** enabled `false` · inQueue `false` · checkCommit `queue-commit-1`
**queue removal** reason `failed_checks` · createdAtUnix `1715799000` · actor `@github-actions` · commit `queue-commit-1` · parents `abc123`

## Failing checks

- `200` — `web › web` [conclusion: CANCELLED] [scope: merge_group, commit: queue-commit-1]

## Instructions

1. Fix each warranted item.
2. Shepherd has no rerun to offer and no log excerpt to show for the checks under `## Failing checks`, so it cannot tell from GitHub's data why they failed or what would fix them. Find out before acting. Playbook: "Check follow-up".
3. If the cause is within this PR, fix it and push. If a rerun is the right call, run it once. Otherwise make no change and keep what you found. If these checks are unchanged on the next poll, Shepherd escalates with `check-follow-up-unavailable`; report that diagnosis then.
4. Triage the merge-queue ejection before any requeue. If the `**queue removal**` reason shows GitHub removed the entry itself, update the PR head from the latest base first. If a person may have dequeued the PR, skip that update unless a conflict step above requires it. Shepherd printed no queue command for this session, so do not enqueue the PR. Playbook: "Merge queue ejection".
5. If the base update or a fix changed the head, commit any remaining changes and push to the PR head branch. If neither did, do not push.
6. Rerun Shepherd now.
