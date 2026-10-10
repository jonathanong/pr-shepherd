import type { RestReview } from "./rest-feedback-read.mts";
import { malformedRest, restString } from "./rest-reader-core.mts";

const REVIEW_STATES = new Set([
  "APPROVED",
  "CHANGES_REQUESTED",
  "COMMENTED",
  "DISMISSED",
  "PENDING",
]);

export function validateRestReviews(reviews: RestReview[]): void {
  for (const review of reviews) {
    if (!REVIEW_STATES.has(restString(review.state, "review state")))
      malformedRest("unknown review state");
    restString(review.commit_id, "review commit_id");
    if (review.state === "PENDING") continue;
    const submitted = restString(review.submitted_at, "review submitted_at");
    if (!Number.isFinite(Date.parse(submitted))) malformedRest("review submitted_at");
  }
}

/** Draft reviews carry no submitted decision and cannot replace earlier submitted evidence. */
export function restLatestReviews(reviews: RestReview[]) {
  const latest = new Map<string, { login: string; state: string }>();
  const submitted = reviews.filter((review) => review.state !== "PENDING");
  submitted.sort(
    (a, b) => Date.parse(a.submitted_at!) - Date.parse(b.submitted_at!) || a.id - b.id,
  );
  for (const review of submitted) {
    if (!review.user?.login) continue;
    latest.set(review.user.login.toLowerCase(), {
      login: review.user.login,
      state: review.state,
    });
  }
  return latest;
}

export function restPendingReviews(reviews: RestReview[]) {
  const pending = new Map<string, { login: string; state: string }>();
  for (const review of reviews) {
    if (review.state !== "PENDING" || !review.user?.login) continue;
    pending.set(review.user.login.toLowerCase(), {
      login: review.user.login,
      state: review.state,
    });
  }
  return [...pending.values()];
}
