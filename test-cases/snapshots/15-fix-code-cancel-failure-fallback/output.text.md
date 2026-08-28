# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Failing checks

- `200` — `CI / tests` [conclusion: FAILURE]

## Post-fix actions

- base: `main`

## Instructions

1. Review each item under `## Failing checks` and decide whether it needs a code change.
2. Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for read-only inspection rules.
3. If you changed code, commit any remaining changes, then stop and hand off for a push whose authorization is established outside Shepherd; do not run the remaining review mutations or iterate until the remote PR head changes. Shepherd cannot verify the Git credential's push authorization. If you did not change code, do not commit and continue with the remaining steps.
4. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
5. `[FIX_CODE]` requires a human handoff for a failing check with no authorized follow-up action. Stop polling after escalating, and resume only after human direction.
