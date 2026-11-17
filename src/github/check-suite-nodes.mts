interface SuiteCommit {
  checkSuites?: { pageInfo?: { hasNextPage: boolean }; nodes: unknown[] } | null;
}

/**
 * GitHub can return `null` in place of a check suite it has not finished
 * creating or cannot read (seen in a PR's first seconds, with no GraphQL error).
 * Nothing is known about such a suite, so it is dropped rather than guessed at,
 * and the page is marked as not fully read: consumers already treat an unread
 * suite page as unverified, which fails readiness closed instead of crashing.
 */
export function dropUnreadableSuites(commit: SuiteCommit | null | undefined): void {
  const suites = commit?.checkSuites;
  if (!suites || !suites.nodes.includes(null)) return;
  suites.nodes = suites.nodes.filter((node) => node !== null);
  suites.pageInfo = { ...suites.pageInfo, hasNextPage: true };
}
