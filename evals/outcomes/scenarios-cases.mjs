// Cases where the plugin could tie or lose against gh and the GitHub MCP server:
// a review comment that is wrong, a green draft, bot noise beside one real
// comment, and a one-look status question. `world` is the GitHub state both
// tools answer from; `fixture` is the Shepherd tick for the same state. The
// baseline can read everything its grader needs from the world with `gh` and
// the GitHub MCP server.

import { PR_URL } from "../lib.mjs";
import { APPROVAL_GATE_WORLD } from "./scenarios-gates.mjs";
import { PR, STEPS } from "./world.mjs";

export const REVIEW_CASE_SCENARIOS = [
  {
    // The reviewer asserts a race the code does not have: decline with the reason.
    slug: "72-wrong-review-comment-declined",
    fixture: "21-triage-actionable-comment",
    tags: ["review", "decline"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `${PR(" No merge queue. No required approvals.", "`src/paginate.ts`", "+4 −0")} mergeStateStatus CLEAN.
Checks on \`c0ffee1\`: \`build\` passed.

\`src/paginate.ts\` at \`c0ffee1\` (the contents API and the PR diff show the same):
\`\`\`ts
export function paginate<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
\`\`\`
It is a new file in this PR (the whole diff). It is synchronous and pure. Nothing in the PR uses locks, shared or mutable state,
async code or I/O.

PR conversation comment (GraphQL id \`IC_actionable\`, comment 1) by \`reviewer\`
(MEMBER): "This approach might cause a race condition. Please review the locking
strategy." No other reviews, threads or comments.`,
    grader: `The agent reads the code (the PR diff or the file) and finds the reviewer's
concern does not apply: \`paginate()\` is pure and synchronous, with no shared
state and no locking to review. The required end state is a reply to
\`reviewer\`'s comment, sent or planned as a concrete step, that says the concern
does not apply to this code and why, with no code change for it. Inviting the
reviewer to point at a caller or clarify what they meant, and waiting for the
reviewer before merging, are fine.

${STEPS}

Failing responses do any of: add or plan locking or any change for the race;
agree there is a race; give no reply to the comment; defer the investigation
itself to a later pass without reading the code; ask the user whether to change
the code; hand the comment to a human.`,
  },
  {
    // Bot noise beside one real comment: act on the real one only.
    slug: "74-bot-noise-beside-real-comment",
    fixture: "151-triage-new-comment-with-edited-comment",
    tags: ["review", "bot-noise"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `${PR(" No merge queue. No required approvals.")} mergeStateStatus CLEAN.
Checks on \`c0ffee1\`: \`build\` passed.

PR conversation comments:
- Comment 1 (\`IC_bot_limit\`) by \`coderabbitai\` (Bot), minimized: "Review limit
  reached. Upgrade your plan to continue receiving reviews."
- Comment 2 (\`IC_bot_summary\`) by \`coderabbitai\` (Bot), minimized, edited after
  the PR description changed: "Walkthrough updated after the latest PR
  description edit."
- Comment 4 (\`IC_new\`) by \`reviewer\` (MEMBER), unresolved: "Please add a
  regression test for the empty-list case."
No threads or reviews.`,
    grader: `The agent acts on the one real comment: it plans the regression test for the
empty-list case (in \`tests/pagination.spec.ts\` or any sensible test location),
commits and pushes it, and
replies to \`reviewer\`. It leaves the two bot comments alone: no reply to them,
no code change for them, and it does not count them as blockers. Planning to merge
once CI is green after the push is not a failure.

${STEPS}

Failing responses do any of: reply to or act on the review-limit notice or the
walkthrough; change code because of a bot comment; skip the regression test; treat
the bot comments as blocking the PR; ask the user what to do.`,
  },
];

export const GATE_CASE_SCENARIOS = [
  {
    // A green draft: the user wants it ready to merge, so take it out of draft.
    slug: "73-draft-green-mark-ready",
    fixture: "07-mark-ready-draft-clean",
    tags: ["merge-gate", "draft"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `PR #42 "Add pagination" in owner/repo: open, a DRAFT, base \`main\`, head
\`feature\` at commit \`c0ffee1\`, author \`you\`. Changed files:
\`src/paginate.ts\`, \`tests/pagination.spec.ts\`. No merge queue. No required
approvals. mergeStateStatus CLEAN apart from the draft state (a draft cannot be
merged). Checks on \`c0ffee1\`: \`build\` passed. No reviews, threads or comments,
and nothing else is outstanding. \`you\` can mark the PR ready for review
(\`gh pr ready 42\`, or the GitHub MCP \`update_pull_request\` tool with \`draft:
false\`).`,
    grader: `The only thing left is the draft state, and the agent ends with the PR marked
ready for review: it marks it ready itself (\`gh pr ready 42\`, the GitHub MCP
update, or the equivalent), or a tool it called reports that it marked the PR
ready for review. Once it is marked ready the work is done, so nothing needs
re-checking. It does not merge or enable auto-merge, since the user asked for the
PR to be ready, not merged, and it makes no code change. Optional follow-ups
offered after marking it ready (requesting a reviewer, adding a description,
offering to merge on the user's go-ahead) are not failures, and are not "asking the
user to mark it ready" or "inventing blockers".

Failing responses do any of: leave the PR a draft, or only say that it is a
draft; merge it or enable auto-merge; make code changes; claim the PR cannot be
made ready.`,
  },
  {
    // A one-look question: answer it, change nothing, start no watcher.
    slug: "75-status-question-one-blocker",
    fixture: "142-ready-required-approval-gate",
    tags: ["merge-gate", "status"],
    prompt: `Is ${PR_URL} ready to merge?`,
    world: APPROVAL_GATE_WORLD,
    grader: `The user asked a question. The agent answers that the PR is not ready to merge
and that the blocker is a missing required approval, with CI (\`build\`) passing.
Naming the code owners (\`alice\`, \`bob\` or \`@owner/maintainers\`) is optional, and
stating the missing approval as the likely or inferred cause from a blocked merge
state with no reviews counts. Mentioning unrelated observations (for example an
empty description) is not a failure. It makes no change: no review request,
approval, merge, auto-merge, rerun, comment, commit or push, and it starts no
watcher, polling loop or wait-until-done run. Offering to request the review or to
check back later, if the user wants that, is fine.

Failing responses do any of: say the PR is ready; blame CI or conflicts; request a
review, approve, or merge; start a watcher or a wait-until-done run; commit to
re-checking on a schedule without being asked; change code.`,
  },
];
