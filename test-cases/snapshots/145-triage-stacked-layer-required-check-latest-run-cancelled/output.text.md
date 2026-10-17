# PR #2687 [TRIAGE]

**status** `FAILING` · **merge** `BLOCKED` · **reviewDecision** `APPROVED`
**summary** 3 passing
Required status checks: static, web, gitleaks [Required]
Stack: 2688 (layer 2/2, base main)

## Failing checks

- `200` — `static › static` [conclusion: CANCELLED]
  rerun: `gh run rerun 200 -R vouchington/vouchington`

- `201` — `web › web` [conclusion: CANCELLED]
  rerun: `gh run rerun 201 -R vouchington/vouchington`

- `202` — `gitleaks › gitleaks` [conclusion: CANCELLED]
  rerun: `gh run rerun 202 -R vouchington/vouchington`

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any changes.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/vouchington/vouchington/pull/2687 '- <decision>'`
5. Rerun Shepherd now.
