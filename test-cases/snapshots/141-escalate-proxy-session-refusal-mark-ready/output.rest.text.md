# PR #42 [ESCALATE]

**status** `READY` · **repo** `owner/repo`
**summary** 1 passing · **remainingSeconds** 300 · **isDraft**
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `transport-unsupported`

GitHub REST POST /repos/owner/repo/pulls/42/ccr/ready_for_review failed: 403 {"message":"GitHub access to this repository is not enabled for this session. Call add_repo again with access:\"push\"."}

## Authorization

- mark-ready: `PR_kwDOAAAAAAA` — GitHub denied the action or did not expose a confirming capability

---

After completing manual fixes (and pushing if required), rerun `/pr-shepherd:pr-shepherd 42` to resume.

## Instructions

1. Stop — human direction is required before automated polling can resume.
