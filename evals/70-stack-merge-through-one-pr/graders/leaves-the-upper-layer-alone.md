---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan lands #632, and #631 beneath it, which must land first, and leaves #633
open. Either route passes: `pr-shepherd stack … --merge-through 632` (listing
#633 in the command is fine) or a one-PR `pr-shepherd <#632> --merge`, which the
CLI routes to `--merge-through`. Saying #633 may need a restack by its owner
afterwards is fine. It does not merge #633 and does not rebase or push #633.

Failing responses do any of: merge layers one at a time with `gh pr merge`;
rebase or push a layer between merges; run `gh stack push`; edit a PR's base
branch by hand.
