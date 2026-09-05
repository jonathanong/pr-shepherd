# PR #42 [ESCALATE]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
Stack: #7 2/3 (base stack/7/1)

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `stacked-pr`

This PR belongs to a GitHub stack, so Shepherd will not emit a merge command. `gh pr merge` targets the PR's own base branch — for a mid-stack layer that is the unmerged parent branch, not the stack's base — and auto-merge is unsupported on stacked PRs. Merge from the GitHub stack UI, or run `gh stack merge --squash 42`, which lands this PR and every unmerged layer below it.

## GitHub stack

- layer: `2` of `3` in stack `7`
- stack base: `stack/7/1`

---

After completing manual fixes (and pushing if required), rerun `/pr-shepherd:pr-shepherd https://github.com/owner/repo/pull/42 --merge` to resume.

## Instructions

1. Stop — human direction is required before automated polling can resume.
