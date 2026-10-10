# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Failing checks

- external `https://checks.example/code-quality` — `Code Quality` [conclusion: FAILURE]
  > 2 annotations

## Check annotations

### external `https://checks.example/code-quality` — `Code Quality`

- `check_annotation_1001` [↗](https://github.com/owner/repo/blob/abc123/src/commands/check.mts#L136) `src/commands/check.mts:136` [FAILURE] — Missing seen-marker boundary
> Only mark annotations seen after they are rendered.
> The marker should be written from the final fix-code checks payload.

- `check_annotation_1002` [↗](https://github.com/owner/repo/blob/abc123/src/commands/iterate/fix-code.mts#L197-L204) `src/commands/iterate/fix-code.mts:197-204` [WARNING]
> Verify annotations survive lean projection.

## Post-fix actions

- base: `main`

## Instructions

1. Review each item under `## Failing checks`, `## Check annotations` and decide whether it needs a code change.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Inspect every referenced range under `## Check annotations` and apply any warranted change.
4. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
5. For any substantial decision or rejection, add a Shepherd Journal entry with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`, linking threads and comments by heading URL and citing reviews by ID.
6. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
