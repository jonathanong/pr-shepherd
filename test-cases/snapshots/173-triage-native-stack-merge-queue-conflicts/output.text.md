# PR #42 [TRIAGE]

**status** `FAILING` · **merge** `DIRTY` · **repo** `owner/repo`
**summary** 1 passing · **branch** conflicts with stack trunk `main`
Merge queue: position 1 UNMERGEABLE [Required]
Stack: 7 (layer 1/1, base main)
**merge queue** enabled `true` · inQueue `true` · state `UNMERGEABLE` · position `1`

## Instructions

1. The branch has merge conflicts (see `**branch**` above). The PR is still in the merge queue, but GitHub cannot merge it until the conflicts are resolved. Choose one path: (a) pull it from the queue and resolve now — first run `gh api graphql -f 'query=mutation DequeuePullRequest($id: ID!) { dequeuePullRequest(input: { id: $id }) { mergeQueueEntry { id } } }' -f id=PR_kwDOAAAAAAA` (`gh pr` cannot remove a queue entry); this PR leaves the queue, and so may any queued layers above it in this stack; other entries stay queued; then: From a clean checkout of `owner/repo`, if `gh stack` does not track stack #7 locally, import it with `gh stack checkout 7`. Then check out the head branch of PR #42 and run `gh stack rebase`. Playbook: "Branch update". Once the PR is ready again, enqueue it and any removed layers again (with `--merge`, Shepherd prints the enqueue command). Or (b) wait — skip the dequeue and every step marked `If you chose (a):`, and rerun Shepherd after the polling interval instead of immediately, until GitHub removes the entry itself; this step repeats until then, and an unchanged conflict escalates through `stall-timeout`. On either path, review items stay deferred until the PR leaves the queue.
2. If you chose (a): Commit any remaining changes on the PR head branch and push the rewritten stack with `gh stack push`.
3. If you chose (a), rerun Shepherd now. If you chose (b), rerun Shepherd after the polling interval.
