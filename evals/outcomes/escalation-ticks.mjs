// Two-tick `iterate` mocks for scenarios whose first tick is an investigation
// tick. The real CLI prints the escalation on the next presented tick of the
// same head, so a caller that asks again in the same pass is answered with it.
//
// Agent mocks see their own call history: the first call gets the current tick
// (with the scenario's transform applied) and every later call the escalation.

/** An `iterate` factory: the first call gets the tick, every later call `second`. */
export const thenEscalate = (second) => (tick) => `---
type: agent
---

If your history shows no earlier call to this command, this is the first call:
answer it with the text between the FIRST lines. Answer every call that follows
an earlier one (the head is unchanged and the checks are unchanged) with the text
between the SECOND lines. Print only that text and nothing else.

=== FIRST
${tick}
===

=== SECOND
${second}
===`;
