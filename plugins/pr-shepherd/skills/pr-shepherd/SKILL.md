---
name: pr-shepherd
description: 'Iterate a GitHub pull request with pr-shepherd (MCP or CLI). Use for requests like "use pr-shepherd", "iterate PR #123", or "run pr-shepherd until this PR is ready".'
user-invocable: true
argument-hint: "[PR number or URL]"
allowed-tools: ["MCP", "Bash", "Read", "Grep", "Glob", "Edit", "Write"]
---

# pr-shepherd

Thin dispatcher for iterating a PR. Poll with the CLI; use MCP `iterate` only when the CLI is unavailable.

## Arguments: $ARGUMENTS

1. Parse an optional PR number or GitHub PR URL from `$ARGUMENTS`; otherwise let pr-shepherd infer the current branch PR.

2. Run the poll command `pr-shepherd` with the optional PR argument and print its full result. Do not run `pr-shepherd iterate`. If the CLI is unavailable and the `iterate` MCP tool is available, call `iterate` and print its full result.

3. Print the full result and follow every returned `## Instructions` step exactly. For CLI output, run each printed mutation command when instructed. For MCP output, use MCP `apply` and `build_suggestion_patch`; do not run a shell `pr-shepherd apply` command.

4. After completing the returned instructions, repeat step 2 unless the action is `[CANCEL]` or `[ESCALATE]`, the instructions require a human handoff, or the human directs you to stop.

## Playbooks

`## Instructions` steps reference these playbooks by name instead of repeating their
mechanics every tick. Apply the referenced playbook in full whenever a step points here.

### Suggestion patches

- The CLI only builds the patch. Apply it, stage the listed file, and follow the returned commit instructions.
- If the command refuses because the suggestion is unsafe (an unsafe anchored range or nested/unbalanced suggestion fences), skip patch application and edit the file manually. Do not retry the command.
- For any other refusal, follow the CLI error's stated recovery action; do not manually edit the suggestion.
- If the patch does not apply for any other reason, edit the file manually instead. Do not retry the command.
- After source drift prevents a generated suggestion patch from applying, replace the heading's exact `path:startLine-endLine` range with the `Replaces lines …` block verbatim. An empty replacement deletes the range. One blank line replaces it with one blank line.
- Keep human-authored thread IDs in `apply review:` so Shepherd replies instead of resolving them.

### CI failure triage

Match each failure's `[conclusion: …]` tag under `## Failing checks` to a rule:

More specific rows win over the general "GitHub Actions failure" row — check conclusion first.

| Tag / kind                                                            | Do                                                                                                                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Actions failure (has a run ID, not `CANCELLED`/`STARTUP_FAILURE`) | Read the included log excerpt if one is rendered. If missing or insufficient, run `gh run view <runId> --log-failed`; open the run URL only if the API still lacks detail. |
| Transient infrastructure failure                                       | Rerun with `gh run rerun <runId> --failed`.                                                                                                                          |
| Real test or build failure                                             | Apply a code fix — do not rerun.                                                                                                                                     |
| `[conclusion: CANCELLED]`                                              | No log excerpt is rendered for this conclusion. Run `gh run rerun <runId>` unless this tick will push new commits. Not resolved by a rerun classification — `## Cancelled runs` is a different section. |
| `[conclusion: STARTUP_FAILURE]`                                        | No log excerpt is rendered for this conclusion. Inspect with `gh run view <runId>`, rerun with `gh run rerun <runId>` if warranted.                                  |
| `external` (no run ID, has a URL)                                      | Open its URL and inspect it.                                                                                                                                         |

### Review-mutation mechanics

Applies to every `apply review:` / `resolve-only:` command the CLI prints. Covers only what stays safe if you run the printed command **unmodified** — `$HEAD_SHA`/`$DISMISS_MESSAGE` substitution and the self-reply exclusion rule are separate CLI-printed steps, not covered here, because the printed command is unsafe by default without them.

- Never add first-look-only or check-annotation IDs to `--reply-thread-ids`, `--resolve-thread-ids`, `--dismiss-review-ids`, or `--minimize-comment-ids` — those flags are pre-populated by the CLI.
- Keep every existing `--dismiss-review-ids` ID the CLI already included. Each is a bot or non-human review that must be dismissed; omitting one leaves the PR in `CHANGES_REQUESTED`.

### Review-mutation routing

For threads under `## Review threads to resolve`: human-authored IDs use `--reply-thread-ids` (Shepherd replies instead of resolving them); bot and non-human IDs use `--resolve-thread-ids`. Use the commands as generated — do not move an ID between flags.

### Shepherd Journal

Link threads and comments in a journal entry from their headings in the CLI output. Cite reviews by ID.
