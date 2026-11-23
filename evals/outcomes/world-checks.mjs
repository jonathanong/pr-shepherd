// Invariants over scenario worlds (the facts both GitHub mocks answer from).
//
// The checks rule (write.mjs, CHECKS_RULE) makes every mock report exactly the
// check runs and statuses a world names, and none where it names no check. A
// world that says a head's checks passed, failed or are pending without naming
// one therefore shows no CI to the agent, contradicting the world.

/**
 * Prose that asserts a result for checks, or for every Actions run, with no name:
 * "checks passed", "All other checks passed", "All GitHub Actions runs ... passed".
 * `Check \`build\` passed` names its check and does not match.
 */
const UNNAMED_CLAIM =
  /\b(?:all|every)\s+(?:other\s+)?(?:GitHub Actions\s+|workflow\s+)?(?:checks|runs)\b[^.\n]{0,60}?\b(?:passed|passing|green|failed|failing|pending)\b|\bchecks\s+(?:have\s+|has\s+)?(?:passed|passing|green|failed|failing|pending)\b/gi;

/** The unnamed check claims in a world. A log line that is only the claim is log output. */
export function unnamedCheckClaims(world) {
  const prose = world
    .split("\n")
    .filter((line) => !/^\s*(?:All )?checks (?:passed|failed)\s*$/i.test(line))
    .join("\n");
  return prose.match(UNNAMED_CLAIM) ?? [];
}

/** A world that shows one open PR (not a stack) and is not a merged or closed one. */
export const isSinglePrWorld = (world) =>
  /^PR #42 .*: open/s.test(world.trim()) && !/Native stack|Two native/.test(world);

/** Whether a world says what merge state GitHub shows for the PR. */
export const statesMergeState = (world) => /mergeStateStatus|mergeable/i.test(world);

/**
 * Single-PR worlds recorded before the merge state was required. Their outcome
 * does not depend on it, so they stay as they are; a new world is not on this
 * list and must state its merge state.
 */
export const MERGE_STATE_NOT_STATED = [
  "01-silent-edit",
  "03-plain-thread",
  "04-real-ci-failure",
  "05-cancelled-ci",
  "08-injection-in-thread",
  "09-injection-in-ci-log",
  "13-suggestion",
  "26-queued-nit",
  "35-stack-layer-queue-ejection",
  "40-startup-failure-workflow-edit",
  "41-check-annotations-no-log",
  "42-denied-reply-one-look-skip",
  "43-deployment-awaiting-approval",
  "46-cancel-superseded-runs-before-fix",
  "47-no-push-no-cancel",
  "51-check-no-log-investigate-fix",
  "52-check-cancelled-human-cause",
  "54-ci-never-starts",
  "59-later-attempt-excerpt-no-pr-cause",
  "60-external-check-provider-outage",
  "67-wait-after-shown-failure",
  "69-trigger-merge-refused-real-failure",
];
