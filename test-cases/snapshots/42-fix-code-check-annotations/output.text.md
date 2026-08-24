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

## Post-fix push

- base: `main`

## Instructions

1. Review each item under `## Failing checks`, `## Check annotations` and decide whether it needs a code change.
2. For each `external` failure, open its URL and inspect it.
3. Inspect every referenced range under `## Check annotations` and apply any warranted change.
4. Do not add annotation IDs to resolve or minimize mutations.
5. If you changed code, commit any remaining changes and push. Otherwise, do not commit or push.
6. For any substantial decision or rejection, append `- <decision>` to `## Shepherd Journal` with `pr-shepherd apply journal 42 '- <decision>'`.
7. Link threads and comments from their headings. Cite reviews by ID.
8. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll: run the default `pr-shepherd` command again, or call MCP `iterate` again. Stop only on `[CANCEL]`, `[ESCALATE]`, or human direction.
