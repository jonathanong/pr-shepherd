# PR #42 [ESCALATE]

**status** `UNKNOWN` · **merge** `HAS_HOOKS` · **repo** `owner/repo`
**summary** 1 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `transport-unsupported`

reviewDecision: REST does not expose an aggregate review decision; latest review states are supplied

---

After completing manual fixes (and pushing if required), rerun `/pr-shepherd:pr-shepherd 42` to resume.

## Instructions

1. Stop — human direction is required before automated polling can resume.
