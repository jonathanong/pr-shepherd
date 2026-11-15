// Shepherd's ticks for scenario 49 (a check is cancelled and nothing explains why).
//
// The first tick is fixture 71 with the check cancelled instead of failed: no rerun
// command and no log excerpt, so Shepherd prints one investigation tick. The second
// is what the real CLI prints on the next presented tick for the same head and
// checks: `ESCALATE` / `check-follow-up-unavailable` after the investigation tick.

/** The recorded tick (a failed second attempt), as a cancelled first attempt. */
export const cancelledNoRerun = (tick) =>
  tick
    .replace("[conclusion: FAILURE] [attempt: 2]", "[conclusion: CANCELLED]")
    .replace("`800` — `CI › tests`", "`801` — `CI › build`");

const ESCALATE = `# PR #42 [ESCALATE]

**status** \`FAILING\` · **repo** \`owner/repo\`

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** \`check-follow-up-unavailable\`

The failing checks below had no rerun and no log excerpt Shepherd could show. After one investigation tick they are unchanged on this head. Report what the investigation found. What remains is a repository, CI-configuration, or workflow-permission change, or waiting out a GitHub incident; each is a human decision.

## Items needing attention

- run \`801\`, URL \`https://github.com/owner/repo/actions/runs/801\` — \`CI › build\` [conclusion: CANCELLED]


---

After completing manual fixes (and pushing if required), rerun \`/pr-shepherd:pr-shepherd https://github.com/owner/repo/pull/42\` to resume.

## Instructions

1. Stop — human direction is required before automated polling can resume. Report the evidence above and the decision the human must make; do not attempt a fix, rerun, requeue, branch update, or merge for this PR.`;

/** An `iterate` mock: the first call gets the recorded tick, every later call the escalation. */
export const followUpIterate = (tick) => `---
type: agent
---

You are the pr-shepherd MCP \`iterate\` tool for PR #42. Count the calls to you in
your history. Answer the first call with the text between the FIRST lines, and
every later call (the head is unchanged and the check is still cancelled) with
the text between the SECOND lines. Print only that text and nothing else.

=== FIRST
${tick}
===

=== SECOND
${ESCALATE}
===`;
