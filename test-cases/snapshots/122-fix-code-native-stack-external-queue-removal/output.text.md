# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
Merge queue: No [Required]
Stack: 7 (layer 1/1, base main)
**merge queue** enabled `true` · inQueue `false` · checkCommit `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`
**queue removal** reason `failed_checks` · createdAtUnix `1715799000` · actor `@github-actions` · commit `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` · parents `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`

## Failing checks

- external `https://ci.example.com/build/42` — `provider / tests` [conclusion: FAILURE] [scope: merge_group, commit: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb]

## Post-fix actions

- base: `main`
- acknowledge queue removal: `pr-shepherd apply queue-removal https://github.com/owner/repo/pull/42 --require-sha aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --queue-commit bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb --removed-at 1715799000`

## Instructions

1. Review each item under `## Failing checks` and decide whether it needs a code change.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
4. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. Playbook: "Shepherd Journal".
5. This PR left the merge queue, and checks failed on its queue commit `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`, which combined the PR head with `main` and any entries queued ahead of it. Do not requeue without triage. Update the stack from the latest `main` and reproduce the failing step on this layer's updated head: From a clean checkout of `owner/repo`, if `gh stack` does not track stack #7 locally, import it with `gh stack checkout 7`. Then check out the head branch of PR #42 and run `gh stack rebase`. Playbook: "Branch update". If the failure belongs to this PR, fix it, commit, push, and iterate. If the failure does not reproduce and the update changed the head, push the rewritten stack with `gh stack push` and iterate. If the failure comes from `main` itself, do not acknowledge it: record the finding with the Shepherd Journal command, make no change, and iterate. An unchanged failure escalates through the stall timeout. Only if the head did not change, no code changed, no other blocker remains, and the failure does not reproduce (the logs or the check's details page show a transient failure, or a failure caused by another entry in the same queue group), run `acknowledge queue removal:` exactly as printed. This records only the disposition of that removed queue commit; finish this one-PR session to validate current source CI and record its READY receipt, then return to the aggregate `--stack` selector with its original options. In merge mode it verifies lower-layer readiness before merging. Do not enqueue or merge this layer directly.
6. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
