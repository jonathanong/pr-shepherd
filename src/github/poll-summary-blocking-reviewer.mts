import { loadConfig } from "../config/load.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

export function detectBlockingReviewer(raw: RawSummaryPr): boolean {
  const prefixes = loadConfig()["mark-ready"]["blocking-reviewer-logins"].map((login) =>
    login.toLowerCase(),
  );
  // A team reviewer has a name, not a login, so it never matches a login prefix.
  const matches = (author: { login?: string } | null): boolean =>
    typeof author?.login === "string" &&
    prefixes.some((prefix) => author.login!.toLowerCase().startsWith(prefix));
  return (
    (raw.reviewRequests?.nodes ?? []).some((request) => matches(request.requestedReviewer)) ||
    (raw.latestReviews?.nodes ?? []).some(
      (review) => review.state === "PENDING" && matches(review.author),
    )
  );
}
