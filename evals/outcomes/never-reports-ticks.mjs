// Shepherd's two ticks for scenario 39 (required check `tests` never reports).
//
// The first tick is fixture 128 with this world's names (it carries the investigate-first
// steps and the "Required checks unreported" playbook pointer). The second tick is what
// the real CLI prints on the next presented tick of the same head after the close/reopen:
// `ESCALATE` / `required-checks-unreported`.

const ESCALATE = `# PR #42 [ESCALATE]

**status** \`PENDING\` · **merge** \`BLOCKED\` · **reviewDecision** \`APPROVED\` · **repo** \`owner/repo\`
Required status checks: tests [Required]
**unreported required** \`tests\`

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** \`required-checks-unreported\`

Required checks are still unreported (\`tests\`): no CI ran on this head after the investigation tick and one retrigger, and no CI is running. Report what the investigation found. What remains is a repository, CI-configuration, or branch-policy change, or waiting out a GitHub incident; each is a human decision.

---

After completing manual fixes (and pushing if required), rerun \`/pr-shepherd:pr-shepherd https://github.com/owner/repo/pull/42\` to resume.

## Instructions

1. Stop — human direction is required before automated polling can resume. Report the evidence above and the decision the human must make; do not attempt a fix, rerun, requeue, branch update, or merge for this PR.`;

/** An `iterate` mock: the first call gets the recorded tick, every later call the escalation. */
export const neverReportsIterate = (tick) => `---
type: agent
---

You are the pr-shepherd MCP \`iterate\` tool for PR #42. Count the calls to you in
your history. Answer the first call with the text between the FIRST lines, and
every later call (the head is unchanged and the checks are still missing) with
the text between the SECOND lines. Print only that text and nothing else.

=== FIRST
${tick}
===

=== SECOND
${ESCALATE}
===`;
