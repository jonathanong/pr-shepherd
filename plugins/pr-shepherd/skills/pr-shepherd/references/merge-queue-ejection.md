# Merge queue ejection

Apply when a step says `Playbook: "Merge queue ejection"`. The `**queue removal**` header names the queue commit. That commit combined the PR head with the base and any entries queued ahead of it, so a failure there may come from this PR, the base, another entry, or a flake. Do not requeue without triage.

1. Update the PR head from the latest base following the repository's branch-update convention. On a native stack, use the printed stack update route instead. Reproduce the failing step on the updated head.
2. If the failure belongs to this PR, fix it, commit, push, and iterate.
3. If the failure does not reproduce and the update changed the head, push it and iterate. On a native stack, push with `gh stack push`. Never run a printed `requeue:` or `acknowledge queue removal:` command after a push. Shepherd prints a fresh queue command once the new head is READY.
4. If the failure comes from the base itself, do not requeue or acknowledge it. Record the finding with the Shepherd Journal command, make no change, and iterate. The unchanged failure escalates through the stall timeout.
5. If the step says no queue command was printed, never enqueue. A failure that does not reproduce follows step 4.
6. Otherwise, run the printed `requeue:` or `acknowledge queue removal:` command exactly as printed, and only if all of these hold:
   - the head did not change;
   - no code changed;
   - no other blocker remains;
   - the logs or the check's details page show a transient failure, or a failure caused by another entry in the same queue group.
7. If gh reports auto-merge is disabled instead of adding the PR to the queue, run the `requeue API fallback:` command. Both requeue commands require the observed PR head SHA. If the head changed, iterate for a fresh command.
8. After `acknowledge queue removal:`, finish this one-PR session so it validates current source CI and records its READY receipt. Then return to the aggregate `--stack` selector with its original options. In merge mode it verifies lower-layer readiness before merging. Never enqueue or merge a stack layer directly.
