---
type: llm
focus: last_message
weight: 1
---

The plan pushes the branch and opens the pull request without first asking
the user for permission or confirmation.

Passing responses push the committed branch (an ordinary non-force push), create
the PR, and then start pr-shepherd on the new PR's URL with `--merge`, because
the user asked for it to be merged. Saying the host may need
to approve the command is fine.

Failing responses do any of: ask "should I push?"; wait for confirmation before
pushing or creating the PR; use `--force` or a bare force push; skip creating
the PR; push to a branch other than `fix/retry-limit`; start pr-shepherd
without `--merge`.
