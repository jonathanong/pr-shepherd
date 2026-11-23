/**
 * Seconds after a head reaches GitHub during which a PR with no relevant check cannot be READY.
 * Apps and Actions register their checks a few seconds after the push, and GitHub reports
 * `CLEAN` with an empty rollup until they do. A constant, not a config key: it is internal
 * tuning with a safe value, and a repository with no CI still finishes once the window passes.
 */
const CHECK_SETTLE_SECONDS = 60;

/**
 * True while a head with no relevant check and no running Actions suite is younger than the
 * settle window. `headFreshAtUnix` is when the head last reached GitHub; without it the head is
 * treated as settled, so an unknown age never holds a PR back.
 */
export function headStillSettling(input: {
  hasChecks: boolean;
  actionsWorkflowInProgress: boolean;
  headFreshAtUnix?: number | undefined;
  nowUnix: number;
}): boolean {
  if (input.hasChecks || input.actionsWorkflowInProgress) return false;
  if (input.headFreshAtUnix === undefined) return false;
  return input.nowUnix - input.headFreshAtUnix < CHECK_SETTLE_SECONDS;
}
