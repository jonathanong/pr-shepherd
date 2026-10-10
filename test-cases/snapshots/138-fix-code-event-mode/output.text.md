# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo` · **pollMode** `event`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
**nextCheck** `2024-05-15T19:57:00Z` · in 3020s · reason `safety-net`

## Failing checks

- `1234567890` — `CI › tests (ubuntu)` [conclusion: FAILURE] [rerun authorized]
  > Run tests
  rerun: `gh run rerun 1234567890 -R owner/repo`

## Post-fix actions

- base: `main`

## Instructions

1. Review each item under `## Failing checks` and decide whether it needs a code change.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
4. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. Playbook: "Shepherd Journal".
5. `[FIX_CODE]` is non-terminal. After the steps above, rerun this command once with the same options, then end the turn without sleeping. Keep exactly one safety-net wake-up at `2024-05-15T19:57:00Z` (`safety-net`). Playbook: "Cloud event loop".
