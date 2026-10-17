# Draft handoff

Apply when handing an open pull request to an external shepherd. Do not also run an in-session `pr-shepherd` loop on that PR. The two paths push and fix on their own.

Dispatch and Recurrence cover the in-session loop, including its clean-draft ready transition and any merge or enqueue.

The adapter supplies three values: how to read the activation gate, what to post or call as dispatch (including any trigger comment), and where the immediate checkpoint is. Label names and provider-specific handoffs stay with the adapter.

Read `isDraft`, `state`, `autoMergeRequest`, and the stack object. When an arm flag is set, also read the repository auto-merge setting once per session. Report those values in the line set below.

1. Resolve the PR from the argument, or from the current branch when there is no argument.
2. Fail closed before any mutation. When the activation gate is unset, unreadable, or not exactly enabled, skip to step 7. Do not comment, mark ready, apply a label, or arm auto-merge.
3. Read the diff and the current CI once. When the shepherd needs direction, post one ordinary PR comment from a reviewed file, never as inline shell text. Refuse that comment when its content, normalized the same way as the dispatch trigger, equals the trigger. A steered handoff does not arm auto-merge.
4. When `isDraft` is true, mark that PR ready with `gh pr ready`.
5. Arm auto-merge only when the caller passed an explicit arm flag, step 3 did not steer, and the stack object shows this PR is not in a stack. Read the repository auto-merge setting once before the arm. A stack blocks the arm and a per-PR dispatch. Arm with `gh pr merge --auto` before dispatch. Do not arm because CI is queued or running, and do not retry a failed arm.
6. Dispatch only when `state` is `OPEN` and the stack object shows no stack. Record the dispatch as accepted, not finished. Do not treat the dispatch workflow's own short run as completion, and do not wait for a terminal checkpoint that cannot arrive.
7. Verify with one `gh pr view --json isDraft,autoMergeRequest,state`. A `state` of `MERGED` means the PR already completed. When the read shows a concurrent human change, report the three fields and do not mutate again.

Report this line set for the PR:

- ready: `isDraft` from the verify read, and whether this run marked it ready
- steered: yes or no
- auto-merge armed: `yes` when `autoMergeRequest` is present after an arm; `no` when this run did not arm; `unavailable` when the repository setting or the stack object blocks an arm; `manual-verification-required` when an arm was attempted and `autoMergeRequest` is absent
- dispatched: yes, or no plus the reason from `state`, the stack object, or the gate
- checkpoint: the immediate checkpoint state when one was observed

A gate that stopped the run still uses this line set. `dispatched` is no, with the gate as the reason, and the other lines show that nothing changed.
