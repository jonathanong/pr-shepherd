# PR #42 [TRIAGE]

**status** `FAILING` · **merge** `DIRTY` · **repo** `owner/repo`
**summary** 1 passing · **branch** conflicts with stack trunk `main`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
Stack: 7 (layer 1/1, base main)

## Instructions

1. The branch has merge conflicts (see `**branch**` above). Use the repository's stack-update procedure for native stack #7 in `owner/repo`, starting at bottom open layer PR #42 and preserving the ordered parent boundaries of every affected upper layer. Read membership with REST-backed Shepherd `stack` output and update and push affected branches using the caller's git workflow. Playbook: "Branch update".
2. If the base update or a fix changed any heads, commit the remaining changes and push every affected stack branch using the repository's stack-update procedure. If no heads changed, do not push.
3. Rerun Shepherd now.
