// The CLI's two ticks for scenario 43 (the Deploy run waits on the `production`
// environment's required reviewers): snapshots 188 and 189.
//
// 188 has a wait timer and a viewer who can approve; this world has neither, and
// adds `@alice` as a reviewer, as 189 already shows.

import { fixtureText } from "../lib.mjs";

const WAIT = fixtureText("188-wait-environment-approval").replace(
  ", viewer can approve: yes, wait timer 5 min",
  ", `@alice`, viewer can approve: no",
);
const STALL = fixtureText("189-escalate-stall-environment-approval");

/** An `iterate` mock: the first call gets the WAIT tick, every later call the stall escalation. */
export const deploymentIterate = () => `---
type: agent
---

If your history shows no earlier call to this command, this is the first call:
answer it with the text between the FIRST lines. Answer every call that follows an
earlier one (the head is unchanged and nobody has approved the deployment) with
the text between the SECOND lines. Print only that text and nothing else.

=== FIRST
${WAIT}
===

=== SECOND
${STALL}
===`;
