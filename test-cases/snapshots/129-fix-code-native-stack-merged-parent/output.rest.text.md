# PR #2547 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY` · **state** `OPEN` · **repo** `vouchington/vouchington`
**summary** 0 passing · **branch** conflicts with stack trunk `main`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
Stack: 2535 (layer 3/6, base main)

## Post-fix actions

- base: `fix/2429-hostname-flags-not-null`

## Instructions

1. The branch has merge conflicts (see `**branch**` above). Use the repository's stack-update procedure for native stack #2535 in `vouchington/vouchington`, starting at bottom open layer PR #2547 and preserving the ordered parent boundaries of every affected upper layer. Read membership with REST-backed Shepherd `--stack` output and update and push affected branches using the caller's git workflow. Playbook: "Branch update".
2. If the base update or a fix changed any heads, commit the remaining changes and push every affected stack branch using the repository's stack-update procedure. If no heads changed, do not push.
3. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
