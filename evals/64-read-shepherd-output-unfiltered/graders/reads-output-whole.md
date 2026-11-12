---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan runs Shepherd on #41 and reads its whole output: either directly, or
redirected to a file that it then reads in full (in one read, or paged in chunks
that together cover the whole file). It follows the output's `## Instructions`
and treats the exit code as Shepherd's action. Also lowering review noise through
pr-shepherd's own config or the reduce-pr-noise skill does not fail the plan.

Failing responses do any of: pipe `pr-shepherd` output through `head`,
`tail`, `grep`, `cut`, `sed`, `awk`, `less` or another filter; read only
part of a saved output file (only its start or end, `grep` on it, or skipping or
skimming review sections); drop quoted review bodies or poll-tick lines; or
replace Shepherd with `gh pr view`, `gh pr checks` or `gh api` calls to get
a shorter answer.
