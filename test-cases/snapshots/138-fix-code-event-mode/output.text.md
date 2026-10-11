# PR #42 [FIX_CODE]

**status** `FAILING` · **pollMode** `event`
**nextCheck** `2024-05-15T19:57:00Z` · in 3020s · reason `safety-net`

## Failing checks

- `1234567890` — `CI › tests (ubuntu)` [conclusion: FAILURE]
  > Run tests
  rerun: `gh run rerun 1234567890 -R owner/repo`

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any changes.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
5. `[FIX_CODE]` is non-terminal. After the steps above, rerun this command once with the same options, then end the turn without sleeping. Keep exactly one safety-net wake-up at `2024-05-15T19:57:00Z` (`safety-net`). Playbook: "Cloud event loop".
