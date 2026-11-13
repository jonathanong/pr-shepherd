import type { Review } from "../types/github.mts";

/**
 * Surface where each changes-requested review was submitted relative to the PR head.
 * `commitOid` stays only when it differs from the head, and then `headOid` carries the head;
 * a review on the head carries neither (lean output). Raw data only — no staleness verdict.
 */
export function withHeadOid(reviews: Review[], headOid: string): Review[] {
  return reviews.map((review) => {
    const { commitOid, ...rest } = review;
    return commitOid && commitOid !== headOid ? { ...rest, commitOid, headOid } : rest;
  });
}
