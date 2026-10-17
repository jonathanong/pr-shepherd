# pr-shepherd features

[← docs index](README.md) | [README](../README.md)

What Shepherd does, the workflow it assumes, and what it does not do. The outcomes and their evidence are on the [README](../README.md#outcomes). Edge cases are listed in [handled-cases.md](handled-cases.md).

## Context gathered

| Area         | What one tick surfaces                                                                                                                                                   | Spec                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Review items | Inline threads (full transcript), PR comments, `COMMENTED` summaries, `APPROVED` and `CHANGES_REQUESTED` reviews                                                         | [comments.md](comments.md)                                               |
| Visibility   | First-look outdated, resolved, and minimized items; edited bodies re-surface                                                                                             | [comments.md](comments.md#first-look-items-comment-visibility-invariant) |
| Provenance   | Raw `authorAssociation`, true-only `viewerDidAuthor`, and `authorType`. No trust label is derived                                                                        | [comments.md](comments.md#trust-and-author-provenance)                   |
| CI           | Checks classified passed / failing / in progress / skipped / filtered / ignored / superseded, with `jobName`, `failedStep`, and a log excerpt when triage can fetch them | [checks.md](checks.md)                                                   |
| Mergeability | `CLEAN`, `BEHIND`, `CONFLICTS`, `BLOCKED`, `UNSTABLE`, `DRAFT`, `UNKNOWN`, plus the merge requirements that apply                                                        | [merge-status.md](merge-status.md)                                       |
| Stacks       | Native-stack topology, ancestry, ownership, and READY receipts for every layer                                                                                           | [cli-usage.md](cli-usage.md)                                             |
| Transport    | GraphQL by default; REST in cloud sessions or after a recognized GraphQL failure. Fields REST lacks stay unknown                                                         | [github-api.md](github-api.md), [rest.md](rest.md)                       |

Log excerpts are omitted for `CANCELLED` and `STARTUP_FAILURE`. The full field inventory is in [context.md](context.md).

## Actions emitted

| Feature                        | Notes                                                                                                                                                                                                         | Spec                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| One action per tick            | `WAIT`, `READY`, `MARK_READY`, `MERGE`, `CANCEL`, `ESCALATE`, or `TRIAGE`; all but `CANCEL` carry numbered `## Instructions`                                                                                  | [actions.md](actions.md), [iterate-flow.md](iterate-flow.md) |
| Review mutations               | `apply review` batches reply / resolve / minimize / dismiss. Generated IDs are capability-filtered; explicit IDs are attempted                                                                                | [comments.md](comments.md#mutation-types)                    |
| Suggestion patches             | `suggest` returns ordered, apply-checked patches and commit metadata. It never writes files or mutates git                                                                                                    | [actions.md](actions.md)                                     |
| Mark ready, ready-delay, merge | Optional `MARK_READY` for clean drafts; an optional ready-delay before `CANCEL` (off by default); with `--merge`, a merge or queue command for the agent (head-pinned for one PR, READY receipts for a stack) | [actions.md](actions.md)                                     |
| Poll debounce                  | `--debounce` (default 1m) holds `TRIAGE` for a settle window and returns one batched tick. MCP `iterate` has no debounce                                                                                      | [cli-usage.md](cli-usage.md)                                 |
| Multi-PR and stack polling     | Compact read-only summaries; one concurrent session per owned layer with work; `gh stack merge` of the ready prefix                                                                                           | [cli-usage.md](cli-usage.md)                                 |
| Shepherd Journal               | Idempotent decision log in the PR body, with a pure extraction API                                                                                                                                            | [api.md](api.md)                                             |
| Exit codes                     | `0` and `10`–`16` for PR state; `64`–`78` for command and GitHub failures                                                                                                                                     | [exit-codes.md](exit-codes.md)                               |

Interfaces: the MCP tools `iterate`, `apply`, `suggest`, `extract_journal`, `get_journal`, and `playbook` ([mcp.md](mcp.md)), and the CLI `pr-shepherd [PR]` and `pr-shepherd iterate [PR]` ([cli-usage.md](cli-usage.md)).

## Configuration

| Setting                                                                           | Spec                                                                                   |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `.pr-shepherdrc.yml`, cascaded from cwd to `$HOME`                                | [configuration.md](configuration.md)                                                   |
| Bundled vendor-noise rules (`classify.standard`)                                  | [configuration.md](configuration.md#classifystandard--default-)                        |
| Custom rules in `.pr-shepherd/classification/`                                    | [actions.md](actions.md#classification-rules), [examples](../examples/classification/) |
| Auth: `GH_TOKEN`, `GITHUB_TOKEN`, `gh auth token`, `GITHUB_PERSONAL_ACCESS_TOKEN` | [authentication.md](authentication.md)                                                 |
| `PR_SHEPHERD_STATE_DIR`, `PR_SHEPHERD_LOG_DISABLED`, `PR_SHEPHERD_LOG_MAX_BODY`   | [configuration.md](configuration.md#environment-variables)                             |

## Workflow assumptions

Shepherd works best on PRs that use required status checks and conversation resolution.

- Push access to the PR head branch is a usage precondition. GitHub viewer fields do not create a separate push handoff.
- The CLI never mutates git. It prints commit and push steps for the agent.
- Every thread, comment, and review summary is surfaced at least once, even when it is already outdated, resolved, or minimized. Edited items re-surface. The exception is a `COMMENTED` review minimized before the first tick, which is not fetched.
- Unmarked bot and other non-human threads, and the viewer's own threads, are replied to and resolved. Other humans' threads are reply-only unless `iterate.resolve-other-human-threads` is `outdated` or `always`. Human items are never minimized. See [conversation-resolution.md](conversation-resolution.md).
- Shepherd recognizes its own reply only by a leading `<!-- pr-shepherd -->` marker. A marked thread is resolve-only on retry.
- Review summaries are not minimized while their inline threads are still unresolved.
- Clean drafts are marked ready unless `mark-ready.auto: false` or `--no-auto-mark-ready` is set.
- With `--merge` on the GraphQL transport, review work is deferred while the PR is in the merge queue, because a push would eject it. Set `actions.work-while-queued: true` to act anyway. Failing checks and conflicts are never deferred. REST cannot see queue membership, so it does not defer.
- With REST, viewer capability is unknown. Otherwise-eligible mutations are attempted and GitHub's response decides.
- `BEHIND` is status, not a rebase. The agent updates the branch when it chooses.

## Not supported

- No long-running daemon. MCP clients call `iterate` again; the shell poll is bounded.
- No merging or branch updates by Shepherd itself, and no continuous rebasing.
- No edits to the working tree. Suggestion patches are returned, not applied.
- No judgment of which comments are actionable, and no rerun-versus-fix decision for CI. The agent decides. Only configured `classify` rules suppress matching noise.
- No automatic edits for threads without a file location.
- Already-minimized `COMMENTED` reviews are not fetched.
- GitHub only. No GitLab, Bitbucket, or Azure DevOps.
