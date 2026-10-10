// Flags that consume the next argument as their value (used for PR-number
// detection only — prevents a flag's value from being mistaken for a PR number).
export const FLAGS_WITH_VALUES = new Set([
  "--transport",
  "--merge-action",
  "--method",
  "--format",
  "--ready-delay",
  "--stall-timeout",
  "--instructions",
  "--poll-mode",
  "--require-sha",
  "--message",
  "--description",
  "--body-file",
  "--file",
  "--stack",
  "--thread-id",
  "--resolve-thread-ids",
  "--reply-thread-ids",
  "--minimize-comment-ids",
  "--dismiss-review-ids",
  "--interval",
  "--timeout",
  "--debounce",
  "--match",
  "--check",
  "--blocked-by",
  "--queue-commit",
  "--removed-at",
]);

// Boolean flags that do NOT consume the next argument. Any --flag not in this
// set and not in FLAGS_WITH_VALUES is treated conservatively as value-taking
// for PR-number detection — so removed flags don't silently cause their
// numeric value to be misidentified as the PR number.
export const BOOLEAN_FLAGS = new Set([
  "--no-auto-mark-ready",
  "--no-auto-cancel-actionable",
  "--quiet-status",
  "--no-quiet-status",
  "--until-terminal",
  "--merge",
  "--dry-run",
  "--verbose",
  "--clear",
  "--adopt-existing-replies",
]);
