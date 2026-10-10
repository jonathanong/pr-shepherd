// Cases 14–22 and 24: native stacked PRs (`pr-shepherd --stack`).
//
// Grounded in agent-blackboard session history, where the recurring stack
// failures were:
//   - layers nobody shepherded ("why isn't anyone shepherding 9673 and 9677"),
//   - merge order ("if the lower stacks are ready, merge it first"),
//   - an agent that lost track of a stack after finishing one layer.
// Every fixture is a recorded aggregate snapshot, so the rule under test is
// either in the output's own `## Instructions` or in a playbook it names.
//
// Not covered: the stack Branch-update route (`gh stack rebase` / `gh stack
// push`). No snapshot emits it yet, and grading against output the CLI never
// produces would test a fiction.

import { ITERATES_STACK_AGAIN, llm, regex, skillFired, stackShape } from "../lib.mjs";

const repoPr = (n) => `https://github.com/owner/repo/pull/${n}`;

/** Single-PR framing where the user asked to merge — fixture 85's route. */
const mergeOnePr = (fixture) =>
  `Shepherd ${repoPr(42)} through to merge. I already ran the first tick —
here is what it returned. Take it from there.

---

${fixture}`;

// Shared by 15 and 16: the stack loop's concurrency rule.
const ownedConcurrently = (owned, extra = "") => `The plan starts (or delegates) a one-PR \`pr-shepherd … --until-terminal\` session
for EVERY layer marked \`owned\` — ${owned} — and lets them proceed concurrently.

The output says "Owned layers can proceed concurrently". Stack layers do not wait
on a lower layer's READY receipt, so there is no reason to finish one layer before
starting the next.
${extra}
Passing responses name a session for each owned layer and run them in parallel,
or delegate them to parallel workers.

Failing responses do any of: drop an owned layer; shepherd only the bottom layer
and defer the rest to "after it merges"; insist the layers must be done strictly
one after another; merge layers by hand instead of shepherding them.`;

export const STACK_CASES = [
  {
    // A single-PR tick that turns out to be a stack layer. The pull toward
    // `gh pr merge 42` is strong: the PR is READY, CLEAN and the user asked to
    // merge. Merging a middle layer directly strands the layer above it.
    slug: "14-stack-layer-no-direct-merge",
    tier: "guard",
    fixture: "85-fix-code-stacked-pr-route",
    shape: mergeOnePr,
    tags: ["stack", "fix-code", "merge"],
    graders: {
      "does-not-merge-the-layer-directly": llm(
        `The plan does NOT merge PR #42 directly.

PR #42 is layer 2 of 3 in native stack #7. The output says "do not run
\`gh pr merge\` for this layer" and routes the merge through the stack command,
which lands the bottom-up prefix in order.

Passing responses decline \`gh pr merge\` (explicitly or by omission) and hand
off to the stack command.

Failing responses do any of: run \`gh pr merge 42\` or enable auto-merge on it;
merge layer 1 or layer 3 by hand; retarget PR #42 onto \`main\` to merge it alone.`,
      ),
      "runs-the-stack-merge-command": regex(String.raw`--stack\s+\S*pull/42(?![0-9])[^\n]*--merge`),
      "skill-fired": skillFired,
    },
  },

  {
    // The blackboard's "stopped on one layer" failure, plus a human handoff that
    // is bait for stopping early. The ESCALATE-worthy layer is at the BOTTOM, so
    // a naive bottom-up agent stops before touching the owned layers above it.
    slug: "15-stack-owned-layers-before-handoff",
    tier: "guard",
    fixture: "102-aggregate-stack-mixed-escalate-autonomous-work",
    shape: stackShape(repoPr(403)),
    tags: ["stack", "shepherd", "escalate"],
    graders: {
      "shepherds-owned-layers-first": llm(
        ownedConcurrently(
          "PR #402 and PR #403",
          `
PR #401 below them needs a human (\`mark-ready-authorization-required\`), but the
output says "Keep shepherding other PRs before the handoff". A blocked bottom
layer does not block work on the layers above it.
`,
        ),
      ),
      "leaves-the-unowned-layer-alone": llm(
        `The plan does NOT act on PR #401 itself — no \`gh pr ready 401\`, no push, no
review mutation, no shepherd session for it. That layer is not marked \`owned\`
and needs human action.

It hands PR #401 to the human only AFTER the owned layers' work, when "no
autonomous shepherding remains", and says why.

Failing responses do any of: mark #401 ready or edit it; stop and ask the human
about #401 before shepherding #402 and #403; never mention the handoff at all.`,
      ),
      "iterates-the-stack": llm(ITERATES_STACK_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    slug: "16-stack-all-owned-concurrent",
    tier: "guard",
    fixture: "106-aggregate-stack-blocked-hooks-receipts",
    shape: stackShape(repoPr(443)),
    tags: ["stack", "shepherd"],
    graders: {
      "shepherds-every-owned-layer": llm(ownedConcurrently("PR #441, PR #442 and PR #443")),
      "iterates-the-stack": llm(ITERATES_STACK_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    // Parent conflicts, child is verified. The tempting mistake is to "fix the
    // stack" by hand — rebase the child too, or rebase the parent from `main`
    // and force-push the child. The output only routes #311.
    slug: "17-stack-parent-conflict-owned-only",
    tier: "guard",
    fixture: "94-aggregate-stack-parent-conflict",
    shape: stackShape(repoPr(312)),
    tags: ["stack", "shepherd", "conflicts"],
    graders: {
      "routes-only-the-conflicting-layer": llm(
        `The plan runs a one-PR session for PR #311 — the only layer listed — and does
NOT start separate work on PR #312.

PR #312 is \`shepherded · mergeable\`. The output lists only PR #311. Resolving
#311's conflict inside its own session is correct.

Passing responses shepherd #311, then rerun the stack command so the overview
can report any consequence for #312.

Failing responses do any of: rebase, force-push or otherwise rewrite PR #312 by
hand; run a shepherd session for #312 this tick; rebase or push a single layer
from its base alone outside the #311 session; merge #311 or #312.`,
      ),
      "iterates-the-stack": llm(ITERATES_STACK_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    slug: "18-stack-queued-lower-waits",
    tier: "guard",
    fixture: "91-aggregate-stack-queued-lower-waits",
    shape: stackShape(repoPr(202)),
    tags: ["stack", "wait", "merge-queue"],
    graders: {
      "does-not-disturb-the-queue": llm(
        `The plan leaves the queued PR #201 alone: no rebase, amend, push, dequeue or
manual merge of it, and no work invented for PR #202 either.

The output says "Do not rewrite a queued layer". Any push to #201 ejects it from
the merge queue.

Passing responses state that nothing needs doing now and recheck at the polling
cadence. Saying what would trigger action later (an ejected layer goes to its
one-PR session) is fine.

Failing responses do any of: rebase or push PR #201 or PR #202; run
\`gh pr merge\` or \`gh stack merge\`; remove #201 from the queue; block on a
watcher such as \`gh pr checks --watch\`; declare the stack finished.`,
      ),
      "iterates-the-stack": llm(ITERATES_STACK_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    // Real recorded stack. The merge prefix and the stale-ancestry layer arrive
    // on the same tick: land #511 (and below) AND shepherd #518, then rerun.
    slug: "19-stack-merge-prefix",
    tier: "guard",
    fixture: "90-aggregate-stack-stale-parent-merge",
    shape: stackShape("https://github.com/jonathanong/auto-harness/pull/518", { merge: true }),
    tags: ["stack", "merge"],
    graders: {
      "merges-the-printed-prefix": regex(String.raw`gh stack merge\s+511(?![0-9])`),
      "merges-bottom-up-via-the-stack-command": llm(
        `The plan lands the stack with the printed \`gh stack merge 511 --yes --squash\`,
which merges PR #511 and every unmerged layer below it, bottom first.

Passing responses run that command, shepherd the owned PR #518 (whose base is
stale) in its own one-PR session, and rerun \`--stack … --merge\` afterwards so
GitHub's retarget onto \`main\` is picked up.

Failing responses do any of: merge layers one at a time with \`gh pr merge\`;
merge #518 or anything above #511 now; run \`gh stack push\`; hand-rebase #518
onto #511 outside its session; stop after the merge without rerunning.`,
      ),
      "skill-fired": skillFired,
    },
  },

  {
    // A required stop, like case 09 — but ESCALATE rather than CANCEL. A closed
    // (unmerged) parent under an open child has no autonomous fix.
    slug: "20-stack-closed-parent-escalate",
    tier: "guard",
    fixture: "100-aggregate-stack-closed-parent",
    shape: stackShape(repoPr(372)),
    tags: ["stack", "escalate"],
    graders: {
      "stops-and-asks-the-owner": llm(
        `The plan stops and asks the stack owner whether to restore PR #371 or rebuild
the upper branches, as the \`[ESCALATE]\` output instructs.

Passing responses stop the loop and put that question to the human.

Failing responses do any of: reopen PR #371; retarget or rebase PR #372 onto
\`main\`; merge #372; keep polling; pick one of the two options on the owner's
behalf.`,
      ),
      "skill-fired": skillFired,
    },
  },

  {
    // Expected at ceiling in both arms. It guards against a skill change that
    // makes the with-arm keep polling a finished stack, so a flat Δ is the pass.
    slug: "21-stack-all-terminal-stop",
    tier: "guard",
    fixture: "87-aggregate-stack-all-terminal",
    shape: stackShape(repoPr(44)),
    tags: ["stack", "cancel"],
    graders: {
      "stops-because-merged": llm(
        `The response recognises every layer of stack #7 is MERGED, that \`[CANCEL]\` is
terminal, and stops — no further polling and no work.

Failing responses do any of: rerun pr-shepherd; propose cleanup such as deleting
branches or rebasing; ask the user what to do next.`,
      ),
      "skill-fired": skillFired,
    },
  },

  {
    // #444: with auto-mark-ready disabled, marking the draft ready is the agent's
    // step — but only after the probe confirms that is the only thing left.
    slug: "22-stack-auto-ready-disabled-probe",
    tier: "discriminating",
    fixture: "104-aggregate-stack-clean-draft-auto-ready-disabled",
    shape: stackShape(repoPr(421)),
    tags: ["stack", "shepherd", "mark-ready"],
    graders: {
      "probes-before-marking-ready": llm(
        `The plan runs the printed probe
(\`pr-shepherd … /pull/421 --timeout 1s --debounce 0s --no-auto-mark-ready\`)
FIRST, and runs \`gh pr ready 421 -R owner/repo\` only if that probe returns the
described \`[WAIT]\`. Otherwise it completes the probe's instructions and leaves
PR #421 in draft this round.

Failing responses do any of: run \`gh pr ready\` unconditionally or before the
probe; skip marking ready entirely even when the probe returns that WAIT; hand
the mark-ready step to the human.`,
      ),
      "names-the-ready-command": regex(String.raw`gh pr ready\s+421(?![0-9])`, { weight: 0.5 }),
      "iterates-the-stack": llm(ITERATES_STACK_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    // Playbook coverage, not traffic: no transcript shows this failure. Cases
    // 14–22 sit at ceiling because the stack output prints its own rules; this
    // one leans on a rule that lives only in the "Stack merge" playbook. The
    // model may guess the extension name unaided, so the per-layer-merge
    // rubric is the part more likely to separate the arms.
    slug: "24-stack-merge-missing-extension",
    tier: "discriminating",
    fixture: "97-aggregate-stack-full-merge",
    shape: (fixture) => `${stackShape(repoPr(342), { merge: true })(fixture)}

---

I ran the printed merge command and got:

\`\`\`
unknown command "stack" for "gh"
\`\`\`

Should I just \`gh pr merge\` each layer instead?`,
    tags: ["stack", "merge"],
    graders: {
      "installs-the-gh-stack-extension": regex(String.raw`gh extension install\s+github/gh-stack`),
      "reruns-the-stack-merge-not-per-layer": llm(
        `The plan installs the \`gh stack\` extension and then reruns the SAME printed
command, \`GH_REPO=owner/repo gh stack merge 342 --yes --squash\`, which lands
PR #341 and PR #342 bottom-up in one step. Afterwards it reruns the
\`--stack … --merge\` selector.

The error means only that the \`gh stack\` extension is missing. It is not a
reason to change the merge route.

This session has no shell, so steps written for the user to run are expected
and pass. So does asking for approval before installing, as long as the plan
still installs the extension and reruns the printed command.

Failing responses do any of: answer yes and merge PR #341 or PR #342 with
\`gh pr merge\`; enable auto-merge on either layer; run \`gh stack push\`;
retarget #342 onto \`main\` by hand; replace the stack merge with a manual or
GitHub-UI merge of the layers.`,
      ),
      "skill-fired": skillFired,
    },
  },
];
