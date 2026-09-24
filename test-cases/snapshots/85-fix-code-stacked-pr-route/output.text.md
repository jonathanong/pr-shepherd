# PR #42 [FIX_CODE]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
Stack: 7 (layer 2/3, base stack/7/1)

## Post-fix actions

- base: `main`

## Instructions

1. PR #42 is layer 2 of 3 in native stack #7; do not run `gh pr merge` for this layer.
2. Run `pr-shepherd --stack https://github.com/owner/repo/pull/42 --until-terminal --merge` to reconcile the stack and run each bottom-layer merge command it emits.
