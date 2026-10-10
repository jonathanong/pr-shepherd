// Cases 01–13: single-PR routing and rule application. Case numbers are stable;
// add new cases in another file rather than renumbering these.

import { ITERATES_AGAIN, llm, regex, shapeA, shapeB, skillFired } from "../lib.mjs";

export const CORE_CASES = [
  {
    // Flagship. The single most common real failure: blocking on a CI watcher
    // instead of letting the CLI poll. The skill forbids it by name; the
    // baseline has no such rule and a watch looks locally sensible.
    slug: "01-ci-in-progress-no-watch",
    tier: "discriminating",
    fixture: "09-wait-in-progress-ci",
    shape: shapeA,
    tags: ["wait", "efficiency"],
    graders: {
      "does-not-block-on-a-ci-watcher": llm(
        `The plan does NOT wait for the in-progress check to finish before doing
anything else.

Specifically, it must not propose \`gh pr checks --watch\`, \`gh pr watch\`,
\`gh run watch\`, an equivalent GitHub MCP check-waiter, or a sleep/poll loop of
its own to block until \`CI / build\` completes. pr-shepherd already owns the
polling; a blocking watcher duplicates it and stalls the loop.

Passing responses iterate again immediately. Explicitly declining to watch CI and
saying why is CORRECT and should pass.

Failing responses do any of: propose any command that blocks until checks
complete; sleep and re-check in the same turn; say they will "wait for CI" before
the next tick.`,
      ),
      "iterates-immediately": llm(ITERATES_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    // Verified real incident: the CLI returned MARK_READY with "Iterate again
    // with the same options to continue" and the agent stopped anyway, prompting
    // "what? why did you stop at MARK_READY?".
    slug: "02-mark-ready-continue",
    tier: "discriminating",
    fixture: "07-mark-ready-draft-clean",
    shape: shapeA,
    tags: ["mark-ready"],
    graders: {
      "treats-mark-ready-as-non-terminal": llm(
        `The response recognises that \`[MARK_READY]\` is non-terminal: the CLI has
already converted the draft to ready, and the correct next step is to iterate
again rather than to stop.

Judge ONLY that question — continue versus stop. A response that continues passes
however briefly or elaborately it does so; describing how it will handle the next
tick's action, or restating the loop's rules, is extra detail and not a defect.

Passing responses continue the loop.

Failing responses do any of: stop and report that the PR was marked ready; ask the
user whether to proceed; treat marking ready as completing the task; wait for CI
to start before continuing.`,
      ),
      "iterates-immediately": llm(ITERATES_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    // Four categories at once. This is the "complex PR situation" case: the
    // model has to hold threads, comments, a failing check and a
    // changes-requested review in mind simultaneously and drop none of them.
    slug: "03-multi-category-fix",
    tier: "guard",
    fixture: "54-fix-code-multi-category-threads-comments-checks-changes",
    shape: shapeA,
    tags: ["fix-code", "complex"],
    graders: {
      "addresses-every-category": llm(
        `The plan addresses ALL FOUR categories of work in the output, not a subset:
the review thread PRRT_multi (extract a helper in src/index.ts), the actionable
comment IC_multi (mention the new flag in the README), the failing check
\`CI > tests\`, and the changes-requested review PRR_multi_cr.

Passing responses walk the categories and commit to an action for each.

Failing responses do any of: silently drop a category; address only the failing
check; treat the changes-requested review as satisfied without addressing the
inline note and the comment; defer categories to "a later pass" without saying
what happens to them now.`,
      ),
      "runs-the-generated-apply-command": llm(
        `The plan commits to running the generated \`apply review\` command.

That command records the agent's disposition of the review items. Skipping it
leaves authorized threads active and the PR stuck — in real traffic this is the
most common way a PR is wrongly reported as finished. It must be run even when
the agent concludes no code change is warranted.

Passing responses include running it as an explicit step.

Failing responses do any of: omit it; describe resolving threads through the
GitHub UI instead; make it conditional on having changed code; mention it only in
passing without committing to run it.`,
      ),
      // Trailing boundary matters: without it `PRRT_multi` also matches a longer
      // identifier such as `PRRT_multi_extra`.
      "keeps-the-thread-id": regex(`--reply-thread-ids\\s+PRRT_multi(?![A-Za-z0-9_-])`, {
        weight: 0.5,
      }),
      "iterates-immediately": llm(ITERATES_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    // Fixture 61 rather than 11: it carries real log evidence
    // (`##[error]Process completed with exit code 1`, two named failing jobs).
    // Fixture 11's only detail is the step name, so an agent that wants to read
    // logs before deciding is behaving correctly there and the grader was unfair.
    slug: "04-real-failure-no-blind-rerun",
    tier: "discriminating",
    fixture: "61-fix-code-aggregate-ci-exit-code",
    shape: shapeA,
    tags: ["fix-code", "ci-triage"],
    graders: {
      "does-not-treat-rerun-as-the-default": llm(
        `The plan does NOT treat \`[rerun authorized]\` as a recommendation to rerun.

The output names two failing jobs (\`test-playwright\`, \`test-playwright-credentialed\`)
and an \`##[error]Process completed with exit code 1\`. That is evidence of tests
failing, not of infrastructure flaking. The rule: a real test or build failure
gets a code fix even when a rerun is authorized.

Passing responses either commit to investigating and fixing the failing tests, or
inspect the specific failing jobs' evidence before deciding — and say clearly that
a rerun is not the default response. Explicitly declining the rerun passes.

Failing responses do any of: schedule \`gh run rerun\` as the primary response;
rerun "to see if it's flaky" before looking at the failure; describe
\`[rerun authorized]\` as shepherd advising a rerun.`,
      ),
      "iterates-immediately": llm(ITERATES_AGAIN),
      "skill-fired": skillFired,
    },
  },

  {
    // Deliberate mirror of case 04. On its own, a grader that penalises reruns is
    // gamed by never rerunning; this case punishes exactly that, so the pair only
    // means anything together.
    slug: "05-cancelled-must-rerun",
    tier: "discriminating",
    fixture: "14-fix-code-cancelled-conclusion",
    shape: shapeB,
    tags: ["fix-code", "ci-triage"],
    graders: {
      // Boundary required: `555` alone also matches `gh run rerun 5550`.
      "issues-the-rerun": regex(`gh run rerun\\s+555(?![0-9])`, { weight: 1 }),
      "treats-cancelled-as-not-a-code-defect": llm(
        `The plan recognises that a \`[conclusion: CANCELLED]\` check is not evidence of
a code defect, and reruns it rather than trying to fix code for it.

A cancelled run produced no failure signal — no log excerpt is rendered — so there
is nothing to fix. The correct move is to run the printed rerun command and
continue iterating without waiting for it to finish.

Passing responses run the rerun and continue.

Failing responses do any of: propose code changes for the cancelled check;
escalate over it; block and wait for the rerun to finish; declare the PR
unfixable.`,
      ),
      "skill-fired": skillFired,
    },
  },

  {
    // Reframed after the transcript mining: the observed failure is skipping the
    // pending command wholesale, not editing its ID list. Zero truncated ID lists
    // were found across three tools.
    slug: "06-fix-code-dismiss-stale-bot",
    tier: "guard",
    fixture: "60-fix-code-bot-cr-not-dismissed",
    shape: shapeA,
    tags: ["fix_code"],
    graders: {
      "continues-autonomously": llm(
        `The response treats \`[FIX_CODE]\` as non-terminal. It evaluates the surfaced
review bodies, makes any warranted code fixes, runs the generated authorized
review mutation with a current pushed head SHA and a truthful disposition, then
iterates Shepherd again. It does not ask a human to dismiss an authorized bot
review just because the review is old.`,
      ),
      "runs-both-dismissals": llm(
        `The response retains both review IDs in the generated \`apply review\`
command and runs that command after any warranted code fixes. It does not drop
one dismissal, replace the command with manual UI directions, or stop at the
first stale review.`,
      ),
      "retains-both-dismiss-ids": regex(`PRR_bot_overdue,PRR_bot_new`, { weight: 0.5 }),
      "skill-fired": skillFired,
    },
  },

  {
    // Sibling of case 06: preserve the thread reply and bot dismissal together.
    slug: "07-fix-code-bot-and-thread",
    tier: "guard",
    fixture: "84-fix-code-bot-cr-with-thread",
    shape: shapeB,
    tags: ["fix_code"],
    graders: {
      "handles-thread-and-bot": llm(
        `The response treats \`[FIX_CODE]\` as non-terminal, evaluates the review
thread and bot review, applies warranted code fixes, retains the generated
thread reply and bot dismissal, then iterates. It does not hand the authorized
dismissal to a human or silently abandon the actionable thread.`,
      ),
      "retains-the-dismiss-id": regex(`--dismiss-review-ids\\s+PRR_bot_overdue_84`, {
        weight: 0.5,
      }),
      "skill-fired": skillFired,
    },
  },

  {
    // Reproduces a failure the author reports seeing repeatedly: agents calling a
    // PR "blocked on an approver" when the output says approvals are NOT required
    // and the real blocker is something else.
    //
    // Known limitation: no fixture in the snapshot corpus has a genuinely
    // `[Required]` gate (trivial `Approvals: None [Not Required]` lines are now
    // omitted from the output), so there is no true-positive mirror. The grader therefore demands correct positive
    // identification of the real blocker rather than mere absence of the word
    // "approval", which would be one-directional and gameable.
    slug: "08-mergeability-diagnosis",
    tier: "guard",
    fixture: "32-fix-code-pr-level-changes-requested",
    shape: shapeB,
    tags: ["fix-code", "mergeability"],
    graders: {
      "names-the-real-blocker": llm(
        `The response identifies the PR-level changes-requested review from @architect
(\`PRR_prlevel\`) as what is holding this PR up.

Passing responses name that review as the blocker and address its substance (the
architecture concern) — optionally noting that merge is \`CLEAN\`, approvals are
not required, and conversations are already resolved.

Failing responses do any of: claim the PR needs an approval, a reviewer sign-off,
or "an approver" before it can merge; report it as blocked on required
conversation resolution; say CI is the blocker; state that nothing is blocking
it.`,
      ),
      "reads-not-required-correctly": llm(
        `The response does NOT treat the approval or conversation-resolution lines as
unmet requirements.

The output prints no \`Approvals:\` or \`Conversations Resolved:\` line. Shepherd
omits those lines when the rule is trivial (no approvals required, conversation
resolution not required), so their absence means this repository does not gate
merges on either, and presenting missing approvals as a blocker is a misreading.

Passing responses either ignore approvals and conversation resolution as
non-blocking or explicitly note they are not required.

Failing responses do any of: list "needs approval" / "awaiting an approver" /
"zero approvals" among the reasons the PR cannot merge; recommend requesting a
reviewer in order to unblock merging; describe conversation resolution as an
outstanding merge requirement.`,
      ),
      "identifies-review-id": regex(`PRR_prlevel`, { weight: 0.5 }),
      "skill-fired": skillFired,
    },
  },

  {
    // Terminal beats all work. The fixture's PR is MERGED while its raw state
    // is `merge DIRTY`, a branch conflicting with base, and unresolved
    // conversations. Lean CANCEL output now prints only `[CANCEL] — merged`, so
    // the bait is no longer rendered; the graders still guard against acting on it.
    slug: "09-cancel-terminal-beats-work",
    tier: "guard",
    fixture: "82-cancel-terminal-beats-all-work",
    shape: shapeA,
    tags: ["cancel", "mergeability"],
    graders: {
      "stops-because-merged": llm(
        `The response recognises the PR is already MERGED, that \`[CANCEL]\` is terminal,
and that the correct action is to stop — no further polling, no work.

Passing responses stop and say the loop is complete because the PR merged.

Failing responses do any of: propose resolving the reported branch conflicts;
propose resolving the unresolved conversations; run review mutations; iterate
again; ask the user what to do next.`,
      ),
      "does-not-act-on-the-dirty-branch": llm(
        `The response does NOT treat \`merge DIRTY\` / "branch conflicts with PR base
main" / \`Conversations Resolved: No\` as work to be done.

Those are stale fields on an already-merged PR. They are bait: a merged PR needs
nothing regardless of what the mergeability and conversation lines say.

Passing responses either ignore those fields or explicitly note they no longer
matter now the PR is merged.

Failing responses plan a rebase, a conflict resolution, a thread resolution, or
any push against this PR.`,
      ),
      "skill-fired": skillFired,
    },
  },

  {
    slug: "10-external-check-no-handoff",
    tier: "discriminating",
    fixture: "12-fix-code-failing-check-external",
    shape: shapeA,
    tags: ["fix-code", "ci-triage"],
    graders: {
      // Recalibrated: the pilot showed both arms planning a sensible
      // investigation and still failing, because the rubric demanded an explicit
      // commitment to continue the loop. The bar is now "does not hand off",
      // which is the actual rule.
      "does-not-hand-off-to-a-human": llm(
        `The response does NOT escalate or hand this off to a human merely because the
failing check is an external status with no GitHub-hosted logs.

The rule: an external check with a URL is an autonomous investigation path —
inspect the provider, or reproduce the failure locally — not an escalation
trigger. A non-empty external URL does not by itself justify stopping.

Passing responses plan to investigate the external failure, in whatever order,
and keep ownership of the problem. Branching on what the provider reveals is
fine.

Failing responses do any of: escalate or ask the user to take over because the
check is external or opaque; declare the failure un-actionable without attempting
to investigate; stop the loop pending someone else's input.`,
      ),
      "skill-fired": skillFired,
    },
  },

  {
    slug: "11-wait-no-work",
    tier: "guard",
    fixture: "24-wait-review-summary-already-surfaced",
    shape: shapeB,
    tags: ["wait"],
    graders: {
      "continues-without-inventing-work": llm(
        `The response recognises that \`[WAIT]\` means there is nothing to do this tick,
that the correct next step is to iterate again, and it characterises the PR's
state correctly.

The output reads \`**summary** 1 passing · **remainingSeconds** 600\` and
\`WAIT: 1 passing\`. So: one check has PASSED, nothing is running,
and the 600 seconds is the ready-delay countdown — NOT a CI job in flight. There
are no review threads, no comments and no failing checks.

Passing responses say no action is needed now and that they will continue, and do
not misdescribe the state.

Failing responses do any of: claim a CI check is still running or in progress;
describe the 600 seconds as time remaining on a CI job; invent review work, code
changes or mutations the output does not contain; propose \`pr-shepherd apply\`
commands that were never emitted; declare the loop finished; ask the user what to
do.`,
      ),
      // A `not_contains` regex on "apply review" lived here and was removed: it
      // scored -0.33 against the with-arm in the pilot as a false positive. With
      // the playbooks loaded the agent correctly described the *general* next-tick
      // procedure ("run each printed mutation command verbatim (`apply review`,
      // resolve-only …); keep every --dismiss-review-ids ID") while inventing
      // no mutation for this tick — which the llm grader above passed 3-0. The
      // regex punished the string rather than the behaviour, penalising the arm
      // that was more precise. Absence checks on natural-language behaviour
      // belong in a rubric, not a pattern.
      "skill-fired": skillFired,
    },
  },

  {
    // Context-efficiency: the annotation already carries file, line and message.
    // Re-fetching the provider's page adds context and no information.
    slug: "12-annotations-already-surfaced",
    tier: "guard",
    fixture: "55-fix-code-failing-check-annotations-with-thread",
    shape: shapeA,
    tags: ["fix-code", "complex", "efficiency"],
    graders: {
      "acts-on-the-surfaced-annotation": llm(
        `The plan acts on the check annotation already in the output —
\`src/util/parse.ts:18\`, "Empty input is not handled before indexing" — and
connects it to the review thread on the same line, which raises the same edge
case.

Passing responses fix the empty-input handling at that location and treat the
thread and the annotation as one underlying defect.

Failing responses do any of: state that the external Code Quality provider page
must be fetched before the failure can be diagnosed; treat the check and the
thread as two unrelated problems; skip the annotation because the check is
external.`,
      ),
      "does-not-demand-the-external-page": llm(
        `The plan does NOT make retrieving the external provider's page or full report
a prerequisite for acting.

The annotation already carries the file, the line and the message. Fetching
\`https://checks.example/code-quality\` would add context without adding
information.

Passing responses work from the surfaced annotation. Mentioning the URL as
optional corroboration is fine.

Failing responses make fetching the external report a required first step, or say
the failure cannot be understood without it.`,
      ),
      "skill-fired": skillFired,
    },
  },

  {
    slug: "13-neg-github-review-api",
    tier: "guard",
    fixture: null,
    tags: ["neg"],
    prompt: `In GitHub's API, what's the difference between a pull request review whose
state is CHANGES_REQUESTED and one that has been DISMISSED? Which webhook events
fire when a review gets dismissed, and does dismissing a review change its stored
state or add a separate record?`,
    graders: {
      "answers-the-question-directly": llm(
        `The response answers the GitHub API knowledge question directly: what
CHANGES_REQUESTED and DISMISSED mean for a review, and what happens on dismissal.

This is a general knowledge question. There is no pull request to iterate, no CLI
output to act on, and no repository in play. Treating it as PR-shepherding work is
the over-trigger this case guards against.

Passing responses explain the review states and the dismissal behaviour. Saying
that no PR-iteration tooling is needed here is CORRECT and should pass, as is
noting uncertainty about specific webhook payload details.

Failing responses do any of: ask which PR to iterate or for a PR URL; propose
running pr-shepherd, \`pr-shepherd apply\`, or a polling loop; produce a
shepherding plan instead of an answer; refuse to answer without a repository.`,
      ),
      "skill-fired": skillFired,
    },
  },
];
