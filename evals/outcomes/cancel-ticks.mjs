// Shepherd's tick for scenario 47 (a reply-only thread beside an eligible run).
//
// Fixture 16 has one open thread and nothing running. This adds the reviewer's
// follow-up to the thread, plus the `## In-progress runs` section and the cancel step
// as fixture 190 prints them, so the case does not depend on a fixture that pairs a
// thread with a running CI run.

const SECTION = `## In-progress runs

- \`500\` — \`CI\` [status: IN_PROGRESS]
  concurrency: cancel-in-progress=true
  cancel: \`gh run cancel 500 -R owner/repo\`

## Instructions
`;

const STEP =
  "1. If any item will need a code change, run every `cancel:` under `## In-progress runs` now, before editing; ignore errors for runs that already finished. If you will push nothing, leave them running.\n";

// The reviewer's follow-up sits in the thread so both arms see that no rename is wanted.
const THREAD_COMMENTS = `#### [commentId=PRRC_1](https://github.com/owner/repo/pull/42#discussion_r1) (@reviewer)

> Please rename this variable to be more descriptive.

#### [commentId=PRRC_2](https://github.com/owner/repo/pull/42#discussion_r2) (@reviewer)

> On second thought, \`d\` is fine for a duration this local. No rename needed; just reply with why the short name is deliberate so it's on record, and I'll resolve.
`;

/** An `iterate` mock tick: the recorded thread tick with a cancellable run. */
export const withCancellableRun = (tick) =>
  tick
    .replace("\n> Please rename this variable to be more descriptive.\n", `\n${THREAD_COMMENTS}`)
    .replace("\n## Instructions\n", `\n${SECTION}`)
    .replace(/^(\d+)\. /gm, (_, n) => `${Number(n) + 1}. `)
    .replace("\n2. Fix each warranted item.", `\n${STEP}2. Fix each warranted item.`);
