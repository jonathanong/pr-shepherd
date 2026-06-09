import { classifyItem, type SeenMarker } from "../state/seen-comments.mts";
import { isHumanAuthor, isConfiguredBotAuthor, type NormalizedBotUsernames } from "./authors.mts";
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

/**
 * Bot CHANGES_REQUESTED reviews are different from every other surfaceable
 * item: the agent — not the author — is responsible for dismissing them via
 * `--dismiss-review-ids` after a fix push. If the agent forgets, the review
 * stays in `CHANGES_REQUESTED` state and silently blocks the PR.
 *
 * The standard seen-gate (`classifyReviewsForDisplay`) suppresses items with
 * unchanged bodies, which would also drop the bot CR ID from the
 * `--dismiss-review-ids` flag — making the bug irrecoverable. This function
 * keeps every bot CR in the visible set on every tick, using the seen-map
 * only to pick the render form:
 *
 * - `new` / `edited` → full bullet (caller renders body normally).
 * - `unchanged` → flagged `staleBotCr: true` so the formatter emits a terse
 *   one-line reminder.
 *
 * Human-authored CR reviews continue to flow through the standard seen-gate.
 */
export function classifyChangesRequestedReviewsForDisplay(
  reviews: Review[],
  seenMap: Map<string, SeenMarker>,
  botUsernames: NormalizedBotUsernames,
): ReviewVisibility {
  const visible: Review[] = [];
  const toMarkSeen: Review[] = [];
  for (const review of reviews) {
    const isBot = !isHumanAuthor(review) || isConfiguredBotAuthor(review, botUsernames);
    const cls = classifyItem(review.id, review.body, seenMap);
    if (isBot) {
      if (cls === "unchanged") {
        visible.push({ ...review, staleBotCr: true });
      } else if (cls === "edited") {
        visible.push({ ...review, edited: true });
        toMarkSeen.push(review);
      } else {
        visible.push(review);
        toMarkSeen.push(review);
      }
      continue;
    }
    if (cls === "unchanged") continue;
    const rendered = cls === "edited" ? { ...review, edited: true } : review;
    visible.push(rendered);
    toMarkSeen.push(review);
  }
  return { visible, toMarkSeen };
}
