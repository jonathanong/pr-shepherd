/**
 * Pre-v1 camelCase config keys and their v1 replacements. Used only to word the error for an
 * unknown key: an old key never takes effect. `[]` stands for any array index.
 */
const RENAMED_KEYS: Readonly<Record<string, string>> = {
  cliCommand: "cli-command",
  botUsernames: "bot-usernames",
  ignoreChecks: "checks.ignore",
  "actions.neverCancelRuns": "checks.never-ignore",
  "checks.ciTriggerEvents": "checks.ci-trigger-events",
  "checks.ignoreLogLines": "checks.ignore-log-lines",
  "iterate.fixAttemptsPerThread": "iterate.triage-attempts-per-thread",
  "iterate.stallTimeoutMinutes": "iterate.stall-timeout-minutes",
  "watch.readyDelayMinutes": "iterate.ready-delay-minutes",
  "iterate.minimizeApprovals": "iterate.minimize-approvals",
  "iterate.minimizeComments": "iterate.minimize-comments",
  "iterate.behindBaseHint": "iterate.behind-base-hint",
  "iterate.resolveOtherHumanThreads": "iterate.resolve-other-human-threads",
  "poll.intervalSeconds": "poll.interval-seconds",
  "poll.stackIntervalFactor": "poll.stack-interval-factor",
  "poll.timeoutSeconds": "poll.timeout-seconds",
  "poll.debounceSeconds": "poll.debounce-seconds",
  "poll.quietStatus": "poll.quiet-status",
  "poll.reconcileSeconds": "poll.reconcile-seconds",
  "watch.graphqlQuotaWarnings":
    "poll.quota-warnings (item keys: remaining-percent, interval-minutes, interval-factor)",
  "poll.quota-warnings[].remainingPercent": "poll.quota-warnings[].remaining-percent",
  "poll.quota-warnings[].pollIntervalMinutes": "poll.quota-warnings[].interval-minutes",
  "poll.quota-warnings[].pollIntervalFactor": "poll.quota-warnings[].interval-factor",
  "resolve.shaPoll.intervalMs": "apply.sha-poll-interval-seconds (seconds, not milliseconds)",
  "resolve.shaPoll.maxAttempts": "apply.sha-poll-max-attempts",
  "mergeStatus.blockingReviewerLogins": "mark-ready.blocking-reviewer-logins",
  "actions.autoMarkReady": "mark-ready.auto",
  "merge.commandArgs": "merge.command-args",
  "actions.autoMinimizeSuppressed": "actions.auto-minimize-suppressed",
  "actions.workWhileQueued": "actions.work-while-queued",
};

/** Pre-v1 keys with no replacement key, and what to do instead. */
const REMOVED_KEYS: Readonly<Record<string, string>> = {
  "poll.mode": "use `pr-shepherd iterate` for single ticks",
};

type PathSegment = string | number;

export function formatPath(path: readonly PathSegment[]): string {
  return path.reduce<string>((text, segment) => {
    if (typeof segment === "number") return `${text}[${segment}]`;
    return text === "" ? segment : `${text}.${segment}`;
  }, "");
}

function renameLookupKey(path: readonly PathSegment[]): string {
  return path.reduce<string>((text, segment) => {
    if (typeof segment === "number") return `${text}[]`;
    return text === "" ? segment : `${text}.${segment}`;
  }, "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Describe one unrecognized key at `path`. Old keys get a rename hint; an unknown section is
 * searched for renamed keys inside it before it is reported as unknown as a whole.
 */
export function describeUnknownKey(path: readonly PathSegment[], value: unknown): string[] {
  const hints = describeNestedKey(path, value);
  return hints.length > 0 ? hints : [`unknown key \`${formatPath(path)}\``];
}

function describeNestedKey(path: readonly PathSegment[], value: unknown): string[] {
  const lookupKey = renameLookupKey(path);
  const removed = REMOVED_KEYS[lookupKey];
  if (removed !== undefined) return [`\`${formatPath(path)}\` was removed: ${removed}`];
  const renamed = RENAMED_KEYS[lookupKey];
  if (renamed !== undefined) {
    const [to, note] = renamed.split(" (");
    return [`\`${formatPath(path)}\` → \`${to}\`${note === undefined ? "" : ` (${note}`}`];
  }
  if (!isPlainObject(value)) return [];
  const children = Object.entries(value).map(([key, child]) => {
    const childPath = [...path, key];
    return { childPath, hints: describeNestedKey(childPath, child) };
  });
  // A section with no old keys is reported whole; otherwise every other child is reported too.
  if (children.every(({ hints }) => hints.length === 0)) return [];
  return children.flatMap(({ childPath, hints }) =>
    hints.length > 0 ? hints : [`unknown key \`${formatPath(childPath)}\``],
  );
}
