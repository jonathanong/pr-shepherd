import type { Review } from "../types/github.mts";

/**
 * Surface where each changes-requested review was submitted relative to the PR head.
 * `commitOid` stays only when it differs from the head, and then `headOid` carries the head and `commitsSince` the commit count between them when known;
 * a review on the head carries neither. Both OIDs are shortened to 7 characters; (lean output). Raw data only — no staleness verdict.
 */
export function withHeadOid(reviews: Review[], headOid: string): Review[] {
  return reviews.map((review) => {
    const { commitOid, commitsSince, ...rest } = review;
    return commitOid && commitOid !== headOid
      ? {
          ...rest,
          commitOid: commitOid.slice(0, 7),
          headOid: headOid.slice(0, 7),
          ...(commitsSince !== undefined && { commitsSince }),
        }
      : rest;
  });
}
