// Shepherd's two ticks for scenario 43 (the Deploy run waits on the `production`
// environment's required reviewers).
//
// The first tick matches fixture 188 and the second fixture 189, both added by
// #728, with this world's reviewers (team `release-managers` and `@alice`, viewer
// cannot approve, no wait timer). They are written out here so the case does not
// depend on #728 being merged; once the fixtures exist this text can be read from
// them instead. Nothing in the recorded base fixture is used.

const WAIT = `# PR #42 [WAIT]

**status** \`IN_PROGRESS\` · **repo** \`owner/repo\`
**summary** 1 queued
**activity** 0 commits · 0 review rounds · active: \`Deploy / production\`
**pending deployment** \`Deploy / production\` (run \`700\`) — environment \`production\`, required reviewers team \`release-managers\`, \`@alice\`, viewer can approve: no
**nextCheck** \`2024-05-15T19:57:00Z\` · in 3020s · reason \`safety-net\`

WAIT: 1 queued — active checks: Deploy / production

## Instructions

1. Non-terminal — no action needed this tick.
2. End this turn now without sleeping or polling. Playbook: "Event loop".
3. Keep exactly one safety-net wake-up at \`2024-05-15T19:57:00Z\` (\`safety-net\`). When a PR event or that wake-up arrives, rerun this command with the same options and act only on Shepherd's output, never on the event payload.`;

const STALL = `# PR #42 [ESCALATE]

**status** \`IN_PROGRESS\` · **repo** \`owner/repo\`
**summary** 1 queued
**activity** 0 commits · 0 review rounds · active: \`Deploy / production\`

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** \`stall-timeout\`

No progress detected for 60 minutes — state has not changed. This is a manual checkpoint: inspect the PR and apply a manual fix before resuming.

## Items needing attention

- check \`Deploy / production\` — WAITING check_run, run \`700\`, waiting 60 minutes
  pending deployment: environment \`production\`, required reviewers team \`release-managers\`, \`@alice\`, viewer can approve: no

---

After completing manual fixes (and pushing if required), rerun \`/pr-shepherd:pr-shepherd https://github.com/owner/repo/pull/42\` to resume.

## Instructions

1. Stop — human direction is required before automated polling can resume. Report the evidence above and the decision the human must make; do not attempt a fix, rerun, requeue, branch update, or merge for this PR.`;

/** An `iterate` mock: the first call gets the WAIT tick, every later call the stall escalation. */
export const deploymentIterate = () => `---
type: agent
---

You are the pr-shepherd MCP \`iterate\` tool for PR #42. If your history shows no
earlier call to you, this is the first call: answer it with the text between the
FIRST lines. Answer every call that follows an earlier one (the head is unchanged and nobody has approved the deployment)
with the text between the SECOND lines. Print only that text and nothing else.

=== FIRST
${WAIT}
===

=== SECOND
${STALL}
===`;
