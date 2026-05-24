import { classifyItem, type SeenMarker } from "../state/seen-comments.mts";
import type { Review } from "../types.mts";

interface ReviewVisibility {
  visible: Review[];
  toMarkSeen: Review[];
}

export function classifyReviewsForDisplay(
  reviews: Review[],
  seenMap: Map<string, SeenMarker>,
): ReviewVisibility {
  const visible: Review[] = [];
  const toMarkSeen: Review[] = [];
  for (const review of reviews) {
    const cls = classifyItem(review.id, review.body, seenMap);
    if (cls === "unchanged") continue;
    const rendered = cls === "edited" ? { ...review, edited: true } : review;
    visible.push(rendered);
    toMarkSeen.push(review);
  }
  return { visible, toMarkSeen };
}
