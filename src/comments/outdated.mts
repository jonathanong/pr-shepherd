/**
 * Determines which review threads should be auto-resolved as outdated.
 *
 * A thread is eligible for auto-resolution when:
 *   - `isOutdated == true` (GitHub marks these when the diff hunk changed), AND
 *   - `isResolved == false`.
 *
 * GitHub's `isOutdated` flag means the thread's referenced code has changed
 * enough that the comment no longer points to a live diff line. These threads
 * are visually collapsed on GitHub and are safe to resolve programmatically.
 */

import type { ReviewThread } from "../types.mts";

/** Returns the subset of threads that should be auto-resolved as outdated. */
export function getOutdatedThreads(threads: ReviewThread[]): ReviewThread[] {
  return threads.filter((t) => t.isOutdated && !t.isResolved);
}
