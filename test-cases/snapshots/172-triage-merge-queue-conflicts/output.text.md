# PR #42 [TRIAGE]

**status** `FAILING` · **merge** `DIRTY` · **repo** `owner/repo`
**summary** 1 passing · **branch** conflicts with PR base `main`
Merge queue: position 2 UNMERGEABLE [Required]
**merge queue** enabled `true` · inQueue `true` · state `UNMERGEABLE` · position `2`

## Instructions

1. The branch has merge conflicts (see `**branch**` above). The PR is still in the merge queue, but GitHub cannot merge it until the conflicts are resolved. Choose one path: (a) pull it from the queue and resolve now — first run `gh api graphql -f 'query=mutation DequeuePullRequest($id: ID!) { dequeuePullRequest(input: { id: $id }) { mergeQueueEntry { id } } }' -f id=PR_kwDOAAAAAAA` (`gh pr` cannot remove a queue entry); only this PR leaves the queue and the other entries stay queued; then: Resolve them before committing. Once the PR is ready again, enqueue it again (with `--merge`, Shepherd prints the enqueue command). Or (b) wait — skip the dequeue and every step marked `If you chose (a):`, and rerun Shepherd after the polling interval instead of immediately, until GitHub removes the entry itself; this step repeats until then, and an unchanged conflict escalates through `stall-timeout`.
2. If you chose (a): Commit any remaining conflict-resolution changes and push to the PR head branch.
3. If you chose (a), rerun Shepherd now. If you chose (b), rerun Shepherd after the polling interval.
