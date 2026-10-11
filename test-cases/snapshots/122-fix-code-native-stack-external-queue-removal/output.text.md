# PR #42 [FIX_CODE]

**status** `FAILING`
**summary** 1 passing
Merge queue: No [Required]
Stack: 7 (layer 1/1, base main)
**merge queue** enabled `true` · inQueue `false` · checkCommit `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`
**queue removal** reason `failed_checks` · createdAtUnix `1715799000` · actor `@github-actions` · commit `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` · parents `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`

## Failing checks

- external `https://ci.example.com/build/42` — `provider / tests` [conclusion: FAILURE] [scope: merge_group, commit: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb]

## Post-fix actions

- acknowledge queue removal: `pr-shepherd apply queue-removal https://github.com/owner/repo/pull/42 --require-sha aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --queue-commit bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb --removed-at 1715799000`

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Triage the merge-queue ejection before any requeue. Update the stack from the latest base first: From a clean checkout of `owner/repo`, if `gh stack` does not track stack #7 locally, import it with `gh stack checkout 7`. Then check out the head branch of PR #42 and run `gh stack rebase`. Playbook: "Branch update". Run `acknowledge queue removal:` only if the failure does not reproduce on the updated head, neither the update nor a code change altered the head, and no other blocker remains. Playbook: "Merge queue ejection".
4. If the base update or a fix changed the head, commit any remaining changes on the PR head branch and push the rewritten stack with `gh stack push`. If neither did, do not push.
5. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
6. Rerun this command now.
