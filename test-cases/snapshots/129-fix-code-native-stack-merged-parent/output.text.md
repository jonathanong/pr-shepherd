# PR #2547 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY` · **state** `OPEN` · **repo** `vouchington/vouchington`
**summary** 0 passing · **branch** conflicts with stack trunk `main`
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
Stack: 2535 (layer 3/6, base main)

## Post-fix actions

- base: `fix/2429-hostname-flags-not-null`

## Instructions

1. The branch has merge conflicts (see `**branch**` above). From a clean checkout of `vouchington/vouchington`, if `gh stack` does not track stack #2535 locally, import it with `gh stack checkout 2535`. Then check out the head branch of PR #2547 and run `gh stack rebase`. Playbook: "Branch update".
2. Commit any remaining changes on the PR head branch and push the rewritten stack with `gh stack push`.
3. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
