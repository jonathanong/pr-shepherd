// Paired cases for the gh baseline pilot (see gh-baseline.mjs). Each pair is
// one PR state shown two ways: Shepherd's recorded output, and the output of
// the `gh` commands an agent without Shepherd would run. Both halves share one
// tool-neutral grader, so the paired score compares outcomes, not commands.

import { PR_URL, llm, skillFired } from "./lib.mjs";

const GH_LEAD = `Get ${PR_URL} ready to merge. I already checked its state with gh. Here is
what it returned. Take it from there.`;

const ghShape = (context, view) => [GH_LEAD, context, "---", view.trim()].filter(Boolean).join("\n\n");

const shepherdShape = (context) => (fixture) =>
  [
    `Shepherd ${PR_URL} through to a terminal state. I already ran the first tick. Here is
what it returned. Take it from there.`,
    context,
    "---",
    fixture,
  ]
    .filter(Boolean)
    .join("\n\n");

const VIEW_HEAD = `$ gh pr view 42 --json state,isDraft,mergeStateStatus,reviewDecision`;

// `gh api` with a --jq projection prints one compact object per line. Without
// it the real response repeats ~40 URL and user fields per comment.
const COMMENTS = `$ gh api repos/owner/repo/pulls/42/comments --jq '.[] | {id, in_reply_to_id, path, line, user: .user.login, created_at, updated_at, body}'`;

const CONTINUES = `After pushing, the plan checks the PR again (with whatever tool it used) and
keeps going until it is ready, rather than presenting the work as finished or
asking the user whether to continue.`;

const SILENT_EDIT_BODY =
  "nit: rename `n` to `pageSize`.\\n\\nAlso, this loop uses `i <= items.length`, so the last page reads one past the end and returns `undefined`. Please fix the bound and add a test for an exact multiple of `pageSize`.";

const BOT_NEW_FIXTURE = "A newer changes-requested review that must be displayed before its retained dismissal runs.";
const BOT_NEW_BODY =
  "Re-reviewed the latest push. The amount validation in `processPayment` (`src/payments.mts:42`) is still missing.";

export const PAIRS = [
  {
    // The reviewer edited a handled thread without marking the edit. gh shows
    // only the current body; Shepherd tags it `[edited since first look]`.
    key: "01-silent-edit",
    fixture: "177-triage-handled-thread-edited-new-ask",
    transform: (t) => t.replace("> Edit: also, this loop", "> Also, this loop"),
    shepherdContext: `On the last tick you renamed \`n\` to \`pageSize\` for thread \`PRRT_edited_ask\`,
pushed, and replied "Renamed \`n\` to \`pageSize\`." This is the next tick.`,
    ghContext: `Earlier you renamed \`n\` to \`pageSize\` for review comment 7, pushed, and
replied "Renamed \`n\` to \`pageSize\`." This is the next check.`,
    gh: `${VIEW_HEAD}
{"isDraft":false,"mergeStateStatus":"BLOCKED","reviewDecision":"","state":"OPEN"}

$ gh pr checks 42
build	pass	1m12s	https://github.com/owner/repo/actions/runs/27400000001/job/76800000001

${COMMENTS}
{"body":"${SILENT_EDIT_BODY}","created_at":"2026-11-10T15:02:11Z","id":7,"in_reply_to_id":null,"line":18,"path":"src/paginate.ts","updated_at":"2026-11-11T09:40:37Z","user":"reviewer"}
{"body":"Renamed \`n\` to \`pageSize\`.","created_at":"2026-11-10T16:20:03Z","id":8,"in_reply_to_id":7,"line":18,"path":"src/paginate.ts","updated_at":"2026-11-10T16:20:04Z","user":"you"}`,
    grader: `The plan acts on the new request in the review thread on \`src/paginate.ts:18\`:
it fixes the loop bound so the last page no longer reads past the end (for
example \`i < items.length\`), adds a test for an item count that is an exact
multiple of \`pageSize\`, commits and pushes, and replies on that thread
describing the bound fix and the test.

${CONTINUES}

Failing responses do any of: treat the thread as already handled because the
rename was done; reply only about the rename; skip the bound fix or the test;
resolve the thread without the fix; ask the user what to do.`,
  },
  {
    // Two changes-requested reviews from a bot keep reviewDecision blocked.
    // Bots do not re-review on their own, so the reviews must be dismissed.
    key: "02-stale-bot-review",
    fixture: "60-triage-bot-cr-not-dismissed",
    // The recorded body reads like an instruction to dismiss, which gh-only
    // plans refused on its own account. Both halves get a plain re-review.
    transform: (t) => t.replace(BOT_NEW_FIXTURE, BOT_NEW_BODY),
    gh: `${VIEW_HEAD},reviews
{
  "isDraft": false,
  "mergeStateStatus": "BLOCKED",
  "reviewDecision": "CHANGES_REQUESTED",
  "reviews": [
    {
      "author": {"login": "claude"},
      "authorAssociation": "NONE",
      "body": "## Summary\\n\\nHere are some blockers I found:\\n\\n1. **Missing input validation.** The \`processPayment\` function at \`src/payments.mts:42\` does not validate the amount field before passing it to the charge API.\\n2. **Race condition.** \`src/queue.mts:88\` reads and writes the job counter without a lock.",
      "id": "PRR_bot_overdue",
      "state": "CHANGES_REQUESTED",
      "submittedAt": "2026-11-08T10:14:52Z"
    },
    {
      "author": {"login": "claude"},
      "authorAssociation": "NONE",
      "body": "${BOT_NEW_BODY}",
      "id": "PRR_bot_new",
      "state": "CHANGES_REQUESTED",
      "submittedAt": "2026-11-11T08:02:30Z"
    }
  ],
  "state": "OPEN"
}

$ gh pr checks 42
no checks reported on the 'feature' branch`,
    grader: `The plan evaluates both changes-requested reviews from the \`claude\` bot
(\`PRR_bot_overdue\` and \`PRR_bot_new\`), makes any warranted code fixes and
pushes them, then dismisses BOTH bot reviews itself (any mechanism counts: a
GitHub API dismissal, a gh command, or a review tool) with a truthful message
about what changed, so the bot's changes-requested state stops blocking.

${CONTINUES}

Failing responses do any of: dismiss only one review; wait for the bot to
re-review on its own; ask a human to dismiss or approve; stop after pushing.`,
  },
  {
    // A required aggregate job failed because two test jobs failed.
    key: "03-real-ci-failure",
    fixture: "61-triage-aggregate-ci-exit-code",
    gh: `${VIEW_HEAD}
{"isDraft":false,"mergeStateStatus":"BLOCKED","reviewDecision":"","state":"OPEN"}

$ gh pr checks 42
tests	fail	0s	https://github.com/owner/repo/actions/runs/27325033780/job/80310000004
test-playwright	fail	11m42s	https://github.com/owner/repo/actions/runs/27325033780/job/80310000002
test-playwright-credentialed	fail	12m05s	https://github.com/owner/repo/actions/runs/27325033780/job/80310000003
lint	pass	1m31s	https://github.com/owner/repo/actions/runs/27325033780/job/80310000001`,
    grader: `The plan treats the failing CI as a real test failure, not a flake: it
investigates the failing \`test-playwright\` and \`test-playwright-credentialed\`
jobs (reading their logs counts) and fixes the cause before anything else. It
does not rerun the run as its primary response.

${CONTINUES}

Failing responses do any of: schedule \`gh run rerun\` as the first or main
response; rerun "to see if it's flaky" before looking at the failure; give up
or hand the failure to a human without investigating.`,
  },
  {
    // Control: a plain open thread both views show equally well.
    key: "04-plain-thread",
    fixture: "16-triage-review-thread",
    gh: `${VIEW_HEAD}
{"isDraft":false,"mergeStateStatus":"BLOCKED","reviewDecision":"","state":"OPEN"}

$ gh pr checks 42
build	pass	1m09s	https://github.com/owner/repo/actions/runs/27400000002/job/76800000002

${COMMENTS}
{"body":"Please rename this variable to be more descriptive.","created_at":"2026-11-10T15:02:11Z","id":1,"in_reply_to_id":null,"line":42,"path":"src/index.ts","updated_at":"2026-11-10T15:02:11Z","user":"reviewer"}`,
    grader: `The plan renames the variable at \`src/index.ts:42\` to a more descriptive
name, commits and pushes, and replies on that review thread saying what changed.

${CONTINUES}

Failing responses do any of: skip the rename, the push, or the reply; ask the
user what to do.`,
  },
];

/** Both halves of every pair as writeCase specs. */
export function pairSpecs() {
  return PAIRS.flatMap((p) => {
    const graders = { outcome: llm(p.grader), "skill-fired": skillFired };
    const base = { tier: "discriminating", area: "github", tags: ["gh-baseline"], graders };
    return [
      {
        ...base,
        slug: `${p.key}-shepherd`,
        fixture: p.fixture,
        transform: p.transform,
        shape: shepherdShape(p.shepherdContext),
      },
      { ...base, slug: `${p.key}-gh`, plan: true, prompt: ghShape(p.ghContext, p.gh) },
    ];
  });
}
