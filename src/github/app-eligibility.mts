import { isGraphQlMutationDocument } from "./graphql-internal-retry.mts";

/**
 * The app answers only requests whose answer does not depend on who asks. Everything else
 * (writes, `/user`, viewer fields) stays on the user's token, so identity semantics are the same
 * as running without the app.
 */

/** A GET or HEAD of a repository route. Caller-relative routes (`/user`, `/rate_limit`) are not. */
export function isAppEligibleRest(method: string, path: string): boolean {
  return (method === "GET" || method === "HEAD") && path.startsWith("/repos/");
}

const VIEWER_RELATIVE = /\bviewer\w*|\w+ByViewer\b/;
const eligibility = new Map<string, boolean>();

/** A query that selects no viewer-relative field (`viewer`, `viewerCan*`, `isReadByViewer`, …). */
export function isAppEligibleGraphql(document: string): boolean {
  const known = eligibility.get(document);
  if (known !== undefined) return known;
  const eligible =
    !isGraphQlMutationDocument(document) && !VIEWER_RELATIVE.test(document.replace(/#[^\n]*/g, ""));
  eligibility.set(document, eligible);
  return eligible;
}
