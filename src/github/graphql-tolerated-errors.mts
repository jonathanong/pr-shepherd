import type { GitHubGraphQlError } from "./errors.mts";

/**
 * A check suite's `app` can be unreadable while the suite itself is readable:
 * GitHub blocks it when the app's owner enforces an IP allow list, and returns
 * the rest of the response with `app: null`. Shepherd reads `app.slug` only to
 * tell GitHub Actions suites apart, and an unreadable app is never Actions, so
 * the null is complete enough to keep the snapshot.
 */
const TOLERATED_PATH = /(^|\.)checkSuites\.nodes\.\d+\.app$/;

function isTolerated(error: GitHubGraphQlError): boolean {
  if (!Array.isArray(error.path)) return false;
  return TOLERATED_PATH.test(error.path.map(String).join("."));
}

/** Drops errors on fields whose null Shepherd already handles. */
export function withoutToleratedErrors(
  errors: GitHubGraphQlError[] | undefined,
): GitHubGraphQlError[] | undefined {
  if (!errors?.length) return errors;
  const rest = errors.filter((e) => !isTolerated(e));
  return rest.length ? rest : undefined;
}
