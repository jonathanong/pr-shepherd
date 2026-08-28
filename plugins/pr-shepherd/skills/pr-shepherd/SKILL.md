---
name: pr-shepherd
description: 'Iterate a GitHub pull request with pr-shepherd (MCP or CLI). Use for requests like "use pr-shepherd", "iterate PR #123", or "run pr-shepherd until this PR is ready".'
user-invocable: true
argument-hint: "[PR number or URL] [--merge]"
allowed-tools: ["MCP", "Bash", "Read", "Grep", "Glob", "Edit", "Write"]
---

# pr-shepherd

Thin dispatcher for iterating a PR. Poll with the CLI; use MCP `iterate` only when the CLI is unavailable.

## Arguments: $ARGUMENTS

1. Parse an optional PR number, repository-qualified `owner/repo#N`, or GitHub PR URL and an optional `--merge` flag from `$ARGUMENTS`; otherwise let pr-shepherd infer the current branch PR. Reject any remaining argument. Follow the target repository's local `AGENTS.md` and `CLAUDE.md` standards while making changes.

2. For the CLI, convert supplied `owner/repo#N` to `https://github.com/owner/repo/pull/N`; otherwise pass the supplied URL or bare number unchanged, then run the poll command `pr-shepherd` with the optional PR argument and forward `--merge` when supplied. A qualified reference may name a fork or upstream repository: it is the GitHub target, while the current checkout continues to supply local git/config/rules context. Do not run `pr-shepherd iterate`. If the CLI is unavailable and the `iterate` MCP tool is available, first obtain a repository-qualified reference: use a supplied GitHub PR URL or `owner/repo#N` unchanged; for a bare number, run `gh pr view <number> --json url --jq .url`; when omitted, run `gh pr view --json url --jq .url`. If that does not produce one qualified PR reference, stop and report that MCP cannot safely determine the PR. Otherwise call `iterate` with that qualified reference, plus `merge: true` when `--merge` was supplied, and print its full result.

3. Print the full result and follow every returned `## Instructions` step exactly. For CLI output, run each printed mutation command when instructed. For MCP output, use MCP `apply` and `build_suggestion_patches` with the same qualified PR reference; do not run a shell `pr-shepherd apply` command.

4. After completing the returned instructions, repeat step 2 unless the action is `[CANCEL]` or `[ESCALATE]`, the instructions require a human handoff, or the human directs you to stop.

## Playbooks

`## Instructions` steps reference these playbooks by name instead of repeating their
mechanics every tick. Apply the referenced playbook in full whenever a step points here.

### Suggestion patches

- Run one plural `build-suggestion-patches` command with a repeated `--thread-id … --message … [--description …]` group for every marked thread in displayed order.
- The CLI only builds patches. Apply, stage, and commit the returned patches in order. Push only when authorization has been established outside Shepherd; GitHub viewer fields cannot verify the local Git credential.
- The command builds from the fetched PR head and accepts a clean local descendant only when the complete ordered patch stream passes `git apply --check`.
- If the command refuses because a suggestion is unsafe or no longer applies, inspect the current source, the displayed replacement block, and reviewer intent before editing manually. Do not apply a stale numeric range blindly or retry unchanged input.
- A returned patch was checked against the then-current worktree. If it later fails, re-inspect the worktree because it changed after validation.
- Keep the generated thread IDs and flag placement unchanged. Viewer-authored human feedback may intentionally appear in both reply and resolve flags; unmarked other-human feedback remains reply-only. Marker-ended other-human feedback is already acknowledged and has no generated mutation.

### CI failure triage

Match each failure's `[conclusion: …]` tag under `## Failing checks` to a rule:

More specific rows win over the general "GitHub Actions failure" row — check conclusion first.

| Tag / kind                                                               | Do                                                                                                                                                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Actions failure (has a run ID, not `CANCELLED`/`STARTUP_FAILURE`) | Read the included log excerpt if one is rendered. If it is missing or insufficient, hand off the displayed run ID/URL; Shepherd cannot verify authorization for another Actions read or mutation. |
| Transient infrastructure failure                                         | Record the diagnosis. Shepherd does not recommend a rerun because GitHub exposes no exact viewer capability for that workflow-run action.                                                         |
| Real test or build failure                                               | Apply a code fix — do not rerun.                                                                                                                                                                  |
| `[conclusion: CANCELLED]`                                                | No log excerpt is rendered. Hand off the displayed metadata; Shepherd cannot verify authorization for another Actions read or mutation.                                                           |
| `[conclusion: STARTUP_FAILURE]`                                          | No log excerpt is rendered. Hand off the displayed metadata; Shepherd cannot verify authorization for another Actions read or mutation.                                                           |
| `external` (no run ID, has a URL)                                        | Preserve the URL in the handoff. Shepherd does not recommend opening it because it cannot verify the current viewer's access to the external system.                                              |

### Review-mutation mechanics

Applies to every `apply review:` / `resolve-only:` command the CLI prints. Covers only what stays safe if you run the printed command **unmodified** — `$HEAD_SHA`/`$DISMISS_MESSAGE` substitution remains a separate CLI-printed step because the command is unsafe by default without those placeholders.

The CLI only includes IDs whose per-object GitHub viewer capability authorizes the corresponding action, and `apply review` repeats that authorization check immediately before mutating.

- Run every generated `apply review:` / `resolve-only:` command even when no code change is warranted. The command records the agent's disposition of the included review items; skipping it leaves bot threads active and can eventually trigger `fix-thrash`.
- Never add first-look-only or check-annotation IDs to `--reply-thread-ids`, `--resolve-thread-ids`, `--dismiss-review-ids`, or `--minimize-comment-ids` — those flags are pre-populated by the CLI.
- Keep every existing `--dismiss-review-ids` ID the CLI already included. Each is a bot or non-human review that must be dismissed; omitting one leaves the PR in `CHANGES_REQUESTED`.

### Review-mutation routing

For threads under both `## Review threads` and `## Review threads to resolve`, evaluate every thread before running mutations. Keep bot and non-human IDs in `--resolve-thread-ids`, including when the feedback is advisory, already satisfied, or otherwise warrants no code change. Unmarked other-human inline-thread IDs use `--reply-thread-ids` only. When the original human inline comment has `viewerDidAuthor: true` and its latest comment is unmarked, keep that same ID in both `--reply-thread-ids` and `--resolve-thread-ids`: the reply runs before the resolve. When the latest comment begins `<!-- pr-shepherd -->`, it is an established Shepherd reply—not merely a same-account comment. A marker-ended viewer-authored thread may be resolve-only for retry; a marker-ended other-human thread is already acknowledged and has no generated mutation. Do not add an unmarked human ID to `--resolve-thread-ids` without its paired generated reply, and do not move IDs between flags.

### Shepherd Journal

Link threads and comments in a journal entry from their headings in the CLI output. Cite reviews by ID.
