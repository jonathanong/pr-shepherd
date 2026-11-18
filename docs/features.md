# pr-shepherd features

[← docs index](README.md) | [README](../README.md)

What Shepherd does, the workflow it assumes, and what it does not do. Per-tick context (reviews, CI, mergeability, stacks, transport): [context.md](context.md). Benefits and evidence: [README](../README.md#benefits). Edge cases: [handled-cases.md](handled-cases.md).

## Actions emitted

| Feature                        | Notes                                                                                                                                                                                                         | Spec                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| One action per tick            | `WAIT`, `READY`, `MARK_READY`, `MERGE`, `CANCEL`, `ESCALATE`, or `TRIAGE`; all but `CANCEL` carry numbered `## Instructions`                                                                                  | [actions.md](actions.md), [iterate-flow.md](iterate-flow.md) |
| Review mutations               | `apply review` batches reply / resolve / minimize / dismiss. Generated IDs are capability-filtered; explicit IDs are attempted                                                                                | [comments.md](comments.md#mutation-types)                    |
| Suggestion patches             | `suggest` returns ordered, apply-checked patches and commit metadata. It never writes files or mutates git                                                                                                    | [actions.md](actions.md)                                     |
| Mark ready, ready-delay, merge | Optional `MARK_READY` for clean drafts; an optional ready-delay before `CANCEL` (off by default); with `--merge`, a merge or queue command for the agent (head-pinned for one PR, READY receipts for a stack) | [actions.md](actions.md)                                     |
| Poll debounce                  | `--debounce` (default 1m) holds `TRIAGE` for a settle window and returns one batched tick. MCP `iterate` has no debounce                                                                                      | [cli-usage.md](cli-usage.md)                                 |
| Multi-PR and stack polling     | Compact summaries (rule auto-resolve is the only mutation); one concurrent session per owned layer with work; `gh stack merge` of the ready prefix                                                            | [cli-usage.md](cli-usage.md)                                 |
| Shepherd Journal               | Idempotent decision log in the PR body, with a pure extraction API                                                                                                                                            | [api.md](api.md)                                             |
| Exit codes                     | `0` and `10`–`16` for PR state; `64`–`78` for command and GitHub failures                                                                                                                                     | [exit-codes.md](exit-codes.md)                               |

Interfaces: the MCP tools `iterate`, `stack`, `apply`, `suggest`, `extract_journal`, `get_journal`, and `playbook` ([mcp.md](mcp.md)), and the CLI `pr-shepherd [PR]` and `pr-shepherd iterate [PR]` ([cli-usage.md](cli-usage.md)).

## Workflow assumptions

Shepherd works best on PRs that use required status checks and conversation resolution.

- Push access to the PR head branch is a usage precondition. GitHub viewer fields do not create a separate push handoff.
- The CLI never mutates git. It prints commit and push steps for the agent, and never merges or updates branches itself.
- Every thread, comment, and review summary is surfaced at least once, even when it is already outdated, resolved, or minimized. Edited items re-surface. The exception is a `COMMENTED` review minimized before the first tick, which is not fetched.
- Unmarked bot and other non-human threads, and the viewer's own threads, are replied to and resolved. Other humans' threads are reply-only unless `iterate.resolve-other-human-threads` is `outdated` or `always`. Human items are never minimized. See [conversation-resolution.md](conversation-resolution.md).
- Shepherd recognizes its own reply only by a leading `<!-- pr-shepherd -->` marker. A marked thread is resolve-only on retry.
- Review summaries are not minimized while their inline threads are still unresolved.
- Clean drafts are marked ready unless `mark-ready.auto: false` or `--no-auto-mark-ready` is set; when disabled, a clean draft remains in draft and returns `CANCEL` after its pending work is handled.
- With `--merge` on the GraphQL transport, review work is deferred while the PR is in the merge queue, because a push would eject it. Set `actions.work-while-queued: true` to act anyway. Failing checks and conflicts are never deferred. REST cannot see queue membership, so it does not defer.
- With REST, viewer capability is unknown. Otherwise-eligible mutations are attempted and GitHub's response decides.
- `BEHIND` is status, not a rebase. The agent updates the branch when it chooses.

## Not supported

- No long-running daemon. MCP clients call `iterate` again; the shell poll is bounded.
- No continuous rebasing.
- No edits to the working tree. Suggestion patches are returned, not applied.
- No judgment of which comments are actionable, and no rerun-versus-fix decision for CI. The agent decides. Only configured `classify` rules suppress matching noise.
- No automatic edits for threads without a file location.
- GitHub only. No GitLab, Bitbucket, or Azure DevOps.
