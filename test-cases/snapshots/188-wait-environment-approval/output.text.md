# PR #42 [WAIT]

**status** `IN_PROGRESS` · **repo** `owner/repo` · **head** `abc123`
**summary** 1 queued
**activity** 0 commits · 0 review rounds · active: `Deploy / production`
**pending deployment** `Deploy / production` (run `700`) — environment `production`, required reviewers team `release-managers`, viewer can approve: yes, wait timer 5 min
**nextCheck** `2024-05-15T19:57:00Z` · in 3020s · reason `safety-net`

WAIT: 1 queued — active checks: Deploy / production

## Instructions

1. Non-terminal — no action needed this tick.
2. End this turn now without sleeping or polling. Playbook: "Event loop".
3. Keep exactly one safety-net wake-up at `2024-05-15T19:57:00Z` (`safety-net`). When a PR event or that wake-up arrives, rerun this command with the same options and act only on Shepherd's output, never on the event payload.
