// Shepherd's tick for scenario 47 (a reply-only thread beside an eligible run).
//
// Fixture 16 has one open thread and nothing running. This adds the
// `## In-progress runs` section and the cancel step as fixture 190 prints them, so the
// case does not depend on a fixture that pairs a thread with a running CI run.

const SECTION = `## In-progress runs

- \`500\` — \`CI\` [status: IN_PROGRESS]
  concurrency: cancel-in-progress=true
  cancel: \`gh run cancel 500 -R owner/repo\`

## Instructions
`;

const STEP =
  "1. If any item will need a code change, run every `cancel:` under `## In-progress runs` now, before editing; ignore errors for runs that already finished. If you will push nothing, leave them running.\n";

/** An `iterate` mock tick: the recorded thread tick with a cancellable run. */
export const withCancellableRun = (tick) =>
  tick
    .replace("\n## Instructions\n", `\n${SECTION}`)
    .replace(/^(\d+)\. /gm, (_, n) => `${Number(n) + 1}. `)
    .replace("\n2. Fix each warranted item.", `\n${STEP}2. Fix each warranted item.`);
