# Draft handoff

Apply when handing an open pull request to an external shepherd. Do not also run an in-session `pr-shepherd` loop on that PR. The two paths push and fix on their own.

Dispatch and Recurrence cover the in-session loop, including its clean-draft ready transition and any merge or enqueue. This path does not run those merge or enqueue commands.

The adapter supplies three values: how to read the activation gate, what to post or call as dispatch (including any trigger comment), and where the immediate checkpoint is. Label names and provider-specific handoffs stay with the adapter.

Pass the resolved PR number and `--repo owner/repo` on every `gh pr` command below. Omitting them selects the current branch's PR.

The caller's `--merge` argument is the arm flag. A request to merge, land, or enqueue is the same flag. No other flag is accepted.

Read `isDraft`, `state`, `autoMergeRequest`, `headRefOid`, and the stack object, which is the pull request's `stack` field. `gh pr view --json` does not return `stack`. A missing or unreadable `stack` field means membership is unavailable, not that the PR is unstacked. Record the activation gate and the stack object with that read. When the arm flag is set, read the repository auto-merge setting once per session via `gh api repos/<owner>/<repo> --jq '{allow_auto_merge,allow_merge_commit,allow_squash_merge,allow_rebase_merge}'`. A failed read is unavailable. Report these values in the line set below.

1. Resolve the PR from the argument, or from the current branch when there is no argument. Record `headRefOid`, the gate, and the stack object. Use `gh pr view <number> --repo <owner/repo> --json id,isDraft,state,autoMergeRequest,headRefOid` for the pull request fields.
2. Fail closed before any mutation. When the activation gate is unset, unreadable, or not exactly enabled, skip to step 7. Do not comment, mark ready, apply a label, or arm auto-merge. When `state` is not `OPEN`, skip to step 7 as well.
3. Read the diff and the current CI once. When the shepherd needs direction, post one ordinary PR comment from a reviewed file, never as inline shell text. Refuse that comment when its content, normalized the same way as the dispatch trigger, equals the trigger. A steered handoff does not arm auto-merge.
4. When `state` is `OPEN` and `isDraft` is true, mark that PR ready with `gh pr ready <number> --repo <owner/repo>`. If that command fails, leave `isDraft` true and skip steps 5 and 6. After it succeeds, `isDraft` is false for the rest of this run.
5. Arm only when the arm flag is set, step 3 did not steer, `state` is `OPEN`, `isDraft` is false, `allow_auto_merge` is true, one merge method is allowed, and the `stack` field is present and shows this PR is not in a stack. When `autoMergeRequest` is already present, leave it and continue. Otherwise call `enablePullRequestAutoMerge` with the step 1 node `id`, `expectedHeadOid` set to that `headRefOid`, and the first allowed method in the order merge, squash, rebase (`MERGE`, `SQUASH`, `REBASE`):

   ```bash
   gh api graphql -f query='mutation($id:ID!,$m:PullRequestMergeMethod!,$oid:GitObjectID){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:$m,expectedHeadOid:$oid}){pullRequest{state}}}' -f id='<id>' -f m='<MERGE|SQUASH|REBASE>' -f oid='<headRefOid>'
   ```

   Do not run `gh pr merge`. A stack, unavailable membership, a failed setting read, or no allowed method blocks the arm and skips step 6. Do not arm because CI is queued or running. If the mutation fails, do not retry it and do not merge the PR instead. If the result `state` is not `OPEN`, skip step 6.

6. Dispatch only when `state` is `OPEN`, `isDraft` is false, and the `stack` field is present and shows no stack. Record the dispatch as accepted, not finished. Then read the adapter's immediate checkpoint once, and keep a rejection or startup failure for the report. Do not treat the dispatch workflow's own short run as completion, and do not wait for a terminal checkpoint that cannot arrive.
7. Verify with one `gh pr view <number> --repo <owner/repo> --json isDraft,autoMergeRequest,state,headRefOid`. Re-read the activation gate and the stack object the same way as step 1. A `state` of `MERGED` means the PR already completed. When `headRefOid`, the gate, or the stack object differs from step 1, or the read disagrees with the mutations this run made, report the fields and do not mutate again.

Report this line set for the PR. For auto-merge armed, use the first match:

- ready: `isDraft` from the verify read, and whether this run marked it ready
- steered: yes or no
- auto-merge armed: `yes` when `autoMergeRequest` is present; `manual-verification-required` when an arm was attempted and `autoMergeRequest` is absent; `unavailable` when the arm flag is set but `allow_auto_merge` is not true, its read failed, no merge method is allowed, or the `stack` field is missing or shows a stack; `no` when the arm flag is unset and `autoMergeRequest` is absent
- dispatched: yes, or no plus the reason from `state`, the `stack` field, `isDraft`, or the gate
- checkpoint: the step 6 checkpoint read, a failed read, or not read when dispatch did not run

A gate that stopped the run still uses this line set. `dispatched` is no, with the gate as the reason, and the other lines show that nothing changed.
