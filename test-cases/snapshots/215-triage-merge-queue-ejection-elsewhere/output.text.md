# PR #42 [TRIAGE]

**status** `FAILING` · **repo** `owner/repo` · **head** `abc123`
Merge queue: No [Required]
**merge queue** enabled `true` · inQueue `false` · checkCommit `queue-commit-1`
**queue removal** reason `failed_checks` · createdAtUnix `1715799000` · actor `@github-actions` · commit `queue-commit-1` · parents `abc123`

## Failing checks

- `45390112233` — `CI › test (3/4)` [conclusion: FAILURE] [scope: merge_group, commit: queue-commit-1]
  > Run tests
  > Error: expected 3 retries, got 2
  Same workflow elsewhere — `CI` (.github/workflows/ci.yml), since 12:50Z:
    checked: `main` last 2 commits · merge queue newest 2 runs
    showing newest 2 of 2 on `main`, 1 of 1 in the merge queue
  - merge queue #812 `f00ba12` run `45390098877` [conclusion: FAILURE]
    - test (1/4): `src/db/pool.test.mts:12` — connect ETIMEDOUT
  - `main` `a1b2c3d` run `45390004411` [conclusion: FAILURE]
    - test (2/4):
      - `src/queue/retry.test.mts:88` — expected 3 retries, got 2
      - `src/queue/retry.test.mts:104` — timed out waiting for retry
      - `src/queue/retry.test.mts:120` — unexpected exit code 1
      - (+2 more annotations)
    - test (3/4) [conclusion: TIMED_OUT] ← same job
  - `main` `9f8e7d6` run `45389870021` [conclusion: SUCCESS]

## Post-fix actions

- requeue: `gh pr merge 42 --repo owner/repo --match-head-commit abc123`
- requeue API fallback: `gh api graphql -f 'query=mutation EnqueuePullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) { enqueuePullRequest(input: { pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid }) { mergeQueueEntry { id } } }' -f pullRequestId=PR_kwDOAAAAAAA -f expectedHeadOid=abc123`

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Some checks under `## Failing checks` have no rerun Shepherd can offer. Playbook: "Check follow-up".
4. Triage the merge-queue ejection before any requeue. Check `Same workflow elsewhere` under `## Failing checks` for recent runs of this workflow on the default branch and other merge-queue entries. Update the PR head from the latest base first. Run `requeue:` only if the failure does not reproduce on the updated head, neither the update nor a code change altered the head, and no other blocker remains. If gh reports auto-merge is disabled, run `requeue API fallback:` instead. Playbook: "Merge queue ejection".
5. If the base update or a fix changed the head, commit any remaining changes and push to the PR head branch. If neither did, do not push.
6. Rerun Shepherd now.
