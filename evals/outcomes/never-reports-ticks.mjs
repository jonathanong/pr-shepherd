// Shepherd's two ticks for scenario 39 (required check `tests` never reports).
//
// The first tick is fixture 128 with this world's names. Its diagnose-first steps
// are written out here (they match src/commands/iterate/unreported-required.mts,
// graphql transport) so the case does not depend on which side of that change the
// recorded snapshot is on; the rewrite is a no-op once the snapshot carries them.
// The second tick is what the real CLI prints on the next presented tick of the
// same head after the close/reopen: `ESCALATE` / `required-checks-unreported`.

const DIAGNOSE = `2. Before retriggering, diagnose why the workflows did not start: compare the \`on:\` triggers and any \`paths\`, \`paths-ignore\`, or branch filters of the workflow that emits each required check against this PR's changed files and base branch.
3. If the filters exclude this PR, do not edit the CI workflow and do not retrigger. Escalate to a human with that diagnosis: the filter, and the changed files it skips. Changing CI configuration is a human decision. If the triggers should have run for this head, retrigger once: run \`gh pr close 42 -R owner/repo\` then \`gh pr reopen 42 -R owner/repo\`.
4. If those checks are still missing on the next poll, do not close the PR again; report the diagnosis. Shepherd escalates with \`required-checks-unreported\` when this remains the only blocker.
5. Rerun Shepherd now.`;

const OLD_STEPS =
  /^2\. Retrigger workflows once[^\n]*\n3\. If those checks[^\n]*\n4\. Rerun Shepherd now\./m;

/** The recorded tick, with the diagnose-first steps. */
export const withDiagnoseSteps = (text) => text.replace(OLD_STEPS, DIAGNOSE);

const ESCALATE = `# PR #42 [ESCALATE]

**status** \`PENDING\` · **merge** \`BLOCKED\` · **reviewDecision** \`APPROVED\` · **repo** \`owner/repo\`
Required status checks: tests [Required]
**unreported required** \`tests\`

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** \`required-checks-unreported\`

Required checks are still unreported (\`tests\`), and no CI is running. Rebase and push is the fix when the branch is behind. This head is current, and another reopen will not create a job the workflow does not emit. Path filters are the usual cause. Investigate that, then handle the missing checks manually.

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
