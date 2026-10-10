---
type: llm
focus: last_message
weight: 1
---

The CLI only builds the patch. After `build-suggestion-patches`, the plan
applies the returned patch, commits and pushes it to the PR head branch, then
runs the printed `apply review` command from the pushed checkout, so its
`--require-sha` resolves to the pushed SHA, with `$DISMISS_MESSAGE` replaced by
a one-sentence summary.

Passing responses do all of that before iterating. Inspecting the source instead
of applying a patch the command refused is also correct.

Failing responses stop after building the patch, rerun pr-shepherd without
applying, committing and pushing it, or skip the `apply review` command.
