---
type: llm
focus: last_message
weight: 1
---

The plan acts on the check annotation already in the output —
`src/util/parse.ts:18`, "Empty input is not handled before indexing" — and
connects it to the review thread on the same line, which raises the same edge
case.

Passing responses fix the empty-input handling at that location and treat the
thread and the annotation as one underlying defect.

Failing responses do any of: state that the external Code Quality provider page
must be fetched before the failure can be diagnosed; treat the check and the
thread as two unrelated problems; skip the annotation because the check is
external.
