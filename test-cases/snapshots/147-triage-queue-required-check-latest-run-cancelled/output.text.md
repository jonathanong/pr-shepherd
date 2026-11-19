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
2. Shepherd has no rerun to offer and no log excerpt to show for the checks under `## Failing checks`, so it cannot tell from GitHub's data why they failed or what would fix them. Find out before acting. Start with `gh run view 200 -R owner/repo`: it lists the run's jobs and annotations. Playbook: "Check follow-up".
3. If this PR's changes caused the failure, fix it and push. Otherwise make no change and keep what you found, even if a code change could work around the failure; do not rerun or retrigger these checks, including with an empty or no-op commit. If these checks are unchanged on the next poll, Shepherd escalates with `check-follow-up-unavailable`; report that diagnosis then.
4. Triage the merge-queue ejection before any requeue. If the `**queue removal**` reason shows GitHub removed the entry itself, update the PR head from the latest base first. If a person may have dequeued the PR, skip that update unless a conflict step above requires it. Shepherd printed no queue command for this session, so do not enqueue the PR. Playbook: "Merge queue ejection".
5. If the base update or a fix changed the head, commit any remaining changes and push to the PR head branch. If neither did, do not push.
6. Rerun Shepherd now.
