# PR #42 [TRIAGE]

**status** `FAILING` · **merge** `DIRTY` · **repo** `owner/repo`
**summary** 1 passing · **branch** conflicts with PR base `main`
Merge queue: position 2 UNMERGEABLE [Required]
**merge queue** enabled `true` · inQueue `true` · state `UNMERGEABLE` · position `2`

## Files changed on both sides since the merge base

- `src/a.ts`
- `lib/new.ts`

## Instructions

1. The branch has merge conflicts (see `**branch**` above). The PR is still in the merge queue, but GitHub cannot merge it until the conflicts are resolved. Choose one path: (a) pull it from the queue and resolve now — first run `gh api graphql -f 'query=mutation DequeuePullRequest($id: ID!) { dequeuePullRequest(input: { id: $id }) { mergeQueueEntry { id } } }' -f id=PR_kwDOAAAAAAA` (`gh pr` cannot remove a queue entry); only this PR leaves the queue and the other entries stay queued; then: Check this repository's instructions (such as `AGENTS.md`) for whether to rebase or merge, update the branch from its base that way, and resolve each conflict keeping both sides' changes unless they contradict. Once the PR is ready again, enqueue it again (with `--merge`, Shepherd prints the enqueue command). Or (b) wait — skip the dequeue and every step marked `If you chose (a):`, and rerun Shepherd after the polling interval instead of immediately, until GitHub removes the entry itself; this step repeats until then, and an unchanged conflict escalates through `stall-timeout`. On either path, review items stay deferred until the PR leaves the queue.
2. If you chose (a): Start with the files under `## Files changed on both sides since the merge base`: the PR and its base both changed them, so they are the likeliest conflicts, but GitHub does not list conflicting files and the list may be incomplete. Resolve the conflicts yourself rather than handing them to the user.
3. If you chose (a): Commit any remaining conflict-resolution changes and push to the PR head branch.
4. If you chose (a), rerun Shepherd now. If you chose (b), rerun Shepherd after the polling interval.
