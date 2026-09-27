# Suggestion patches

Apply when a step says `Playbook: "Suggestion patches"`.

- Run one `build-suggestion-patches` command. Repeat `--thread-id`, `--message`, and optional `--description` for every marked thread, in displayed order.
- The CLI only builds patches. Apply, stage, and commit them in order, then follow the commit, push, review-mutation, and continuation steps. Push access to the PR head is a usage precondition.
- The command builds from the fetched PR head. It accepts a clean local descendant only when the full ordered patch stream passes `git apply --check`.
- If the command refuses because a suggestion is unsafe or no longer applies, inspect the current source, the displayed replacement, and the reviewer's intent before editing. Do not apply a stale line range or retry the same input.
- A returned patch was checked against the worktree at that moment. If it later fails, inspect the worktree again.
- Use the thread IDs and flag placement returned with the patch command.
