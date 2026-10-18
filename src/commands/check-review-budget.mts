import {
  selectReviewOutput,
  type BudgetItem,
  type ReviewItemRollup,
} from "../comments/review-output-budget.mts";
import { threadTranscriptBody } from "../threads/transcript.mts";
import type {
  ActionableComment,
  EditedComment,
  FirstLookComment,
  FirstLookThread,
  Review,
  ReviewThread,
} from "../types.mts";

/** Every check.mts list that renders a review item, generates a mutation for it, or marks it seen. */
export interface ReviewOutputBuckets {
  changesRequested: { visible: Review[]; toMarkSeen: Review[] };
  threads: {
    activeThreads: ReviewThread[];
    resolutionOnlyThreads: ReviewThread[];
    firstLookThreads: FirstLookThread[];
    toMarkSeen: ReviewThread[];
  };
  comments: {
    actionable: ActionableComment[];
    minimizeIds: string[];
    toMarkSeen: ActionableComment[];
  };
  firstLookComments: FirstLookComment[];
  firstLookSummaries: Review[];
  editedSummaries: Review[];
  editedComments: EditedComment[];
}

const bodyItem = (item: { id: string; body: string; createdAtUnix?: number }): BudgetItem => ({
  id: item.id,
  cost: item.body.length,
  ...(item.createdAtUnix !== undefined && { createdAtUnix: item.createdAtUnix }),
});

const threadItem = (thread: ReviewThread): BudgetItem => ({
  ...bodyItem(thread),
  cost: threadTranscriptBody(thread).length,
});

/**
 * Applies `iterate.reviewOutputMaxChars` to one tick's review buckets. Priority: changes-requested
 * reviews, active threads and comments, first-look items, review summaries, edited comments.
 * Approved reviews are opt-in minimize targets, not review work, and are never held.
 * Held items leave every list — the report, the generated mutation IDs, and the seen-marker
 * writes — so the next tick shows them. `rollup` is set only when something was held.
 */
export function applyReviewOutputBudget(
  buckets: ReviewOutputBuckets,
  maxChars: number,
): { buckets: ReviewOutputBuckets; rollup?: ReviewItemRollup } {
  const { changesRequested, threads, comments } = buckets;
  const selection = selectReviewOutput(
    [
      changesRequested.visible.map(bodyItem),
      [
        ...threads.activeThreads.map(threadItem),
        ...threads.resolutionOnlyThreads.map(threadItem),
        ...comments.actionable.map(bodyItem),
      ],
      [...threads.firstLookThreads.map(threadItem), ...buckets.firstLookComments.map(bodyItem)],
      [...buckets.firstLookSummaries.map(bodyItem), ...buckets.editedSummaries.map(bodyItem)],
      buckets.editedComments.map(bodyItem),
    ],
    maxChars,
  );
  if (selection.rollup === undefined) return { buckets };
  const keep = <T extends { id: string }>(items: T[]): T[] =>
    items.filter((item) => selection.keep(item.id));
  return {
    buckets: {
      changesRequested: {
        visible: keep(changesRequested.visible),
        toMarkSeen: keep(changesRequested.toMarkSeen),
      },
      threads: {
        activeThreads: keep(threads.activeThreads),
        resolutionOnlyThreads: keep(threads.resolutionOnlyThreads),
        firstLookThreads: keep(threads.firstLookThreads),
        toMarkSeen: keep(threads.toMarkSeen),
      },
      comments: {
        actionable: keep(comments.actionable),
        minimizeIds: comments.minimizeIds.filter(selection.keep),
        toMarkSeen: keep(comments.toMarkSeen),
      },
      firstLookComments: keep(buckets.firstLookComments),
      firstLookSummaries: keep(buckets.firstLookSummaries),
      editedSummaries: keep(buckets.editedSummaries),
      editedComments: keep(buckets.editedComments),
    },
    rollup: selection.rollup,
  };
}
