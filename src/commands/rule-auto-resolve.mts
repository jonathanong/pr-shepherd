import type { BatchPartition } from "../classify/apply.mts";
import { autoMinimizeComments, autoResolveThreads } from "../comments/resolve.mts";
import { runJournal } from "./journal/index.mts";
import type { AutoMinimizedItem, AutoResolvedThread, BatchPrData } from "../types.mts";
import {
  decorateAutoResolveError,
  formatRuleAutoResolveJournalItem,
  minimizedItem,
  reasonClause,
  reasonsForError,
  resolvedThread,
  ruleAutoResolveBody,
  uniqueReasons,
} from "./rule-auto-resolve-format.mts";

export interface RuleAutoResolveApplied {
  threadIds: string[];
  commentIds: string[];
  reviewSummaryIds: string[];
  autoResolved: AutoResolvedThread[];
  autoMinimized: AutoMinimizedItem[];
  autoResolveErrors: string[];
}

const EMPTY: RuleAutoResolveApplied = {
  threadIds: [],
  commentIds: [],
  reviewSummaryIds: [],
  autoResolved: [],
  autoMinimized: [],
  autoResolveErrors: [],
};

function idsIn(ids: readonly string[], confirmed: ReadonlySet<string>): string[] {
  return ids.filter((id) => confirmed.has(id));
}

function decorateErrors(
  errors: readonly string[],
  ids: readonly string[],
  ruleReasons: BatchPartition["ruleReasons"],
): string[] {
  return errors.map((error) =>
    decorateAutoResolveError(error, reasonsForError(error, ids, ruleReasons)),
  );
}

function successReasons(
  ids: readonly string[],
  ruleReasons: BatchPartition["ruleReasons"],
): string[] {
  return uniqueReasons(ids.flatMap((id) => [...(ruleReasons.get(id) ?? [])]));
}

export async function applySuppressedRuleAutoResolve(input: {
  enabled: boolean;
  partition: BatchPartition;
  batch: BatchPrData;
  prNumber: number;
  repo: { owner: string; name: string };
}): Promise<RuleAutoResolveApplied> {
  if (!input.enabled) {
    return {
      ...EMPTY,
      threadIds: input.partition.ruleAutoResolveThreadIds,
      commentIds: input.partition.ruleAutoResolveCommentIds,
      reviewSummaryIds: input.partition.ruleAutoResolveReviewSummaryIds,
    };
  }
  const commentIds = input.partition.ruleAutoResolveCommentIds.filter((id) =>
    input.partition.suppressedCommentIds.has(id),
  );
  const reviewSummaryIds = input.partition.ruleAutoResolveReviewSummaryIds.filter((id) =>
    input.partition.suppressedReviewSummaryIds.has(id),
  );
  const threadIds = input.partition.ruleAutoResolveThreadIds.filter((id) =>
    input.partition.suppressedThreadIds.has(id),
  );
  const minimizeIds = [...commentIds, ...reviewSummaryIds];
  const [minimized, resolved] = await Promise.all([
    minimizeIds.length > 0
      ? autoMinimizeComments(minimizeIds)
      : Promise.resolve({ minimized: [], errors: [] }),
    threadIds.length > 0
      ? autoResolveThreads(threadIds)
      : Promise.resolve({ resolved: [], errors: [] }),
  ]);
  const minimizedSet = new Set(minimized.minimized);
  const resolvedSet = new Set(resolved.resolved);
  const resolvedIds = idsIn(threadIds, resolvedSet);
  const minimizedCommentIds = idsIn(commentIds, minimizedSet);
  const minimizedSummaryIds = idsIn(reviewSummaryIds, minimizedSet);
  const threadsById = new Map(input.batch.reviewThreads.map((thread) => [thread.id, thread]));
  const commentsById = new Map(input.batch.comments.map((comment) => [comment.id, comment]));
  const summariesById = new Map(input.batch.reviewSummaries.map((review) => [review.id, review]));
  const autoResolved = resolvedIds.flatMap((id) => {
    const thread = threadsById.get(id);
    return thread ? [resolvedThread(thread, input.partition.ruleReasons.get(id) ?? [])] : [];
  });
  const autoMinimized = [
    ...minimizedCommentIds.map((id) =>
      minimizedItem(
        "pr-comment",
        id,
        commentsById.get(id)?.url,
        input.partition.ruleReasons.get(id) ?? [],
      ),
    ),
    ...minimizedSummaryIds.map((id) =>
      minimizedItem(
        "review-summary",
        id,
        summariesById.get(id)?.url,
        input.partition.ruleReasons.get(id) ?? [],
      ),
    ),
  ];
  const autoResolveErrors = [
    ...decorateErrors(minimized.errors, minimizeIds, input.partition.ruleReasons),
    ...decorateErrors(resolved.errors, threadIds, input.partition.ruleReasons),
  ];
  const journalError = await journalSuccesses(input, autoResolved, autoMinimized);
  if (journalError) autoResolveErrors.push(journalError);
  return {
    threadIds: input.partition.ruleAutoResolveThreadIds.filter((id) => !resolvedSet.has(id)),
    commentIds: input.partition.ruleAutoResolveCommentIds.filter((id) => !minimizedSet.has(id)),
    reviewSummaryIds: input.partition.ruleAutoResolveReviewSummaryIds.filter(
      (id) => !minimizedSet.has(id),
    ),
    autoResolved,
    autoMinimized,
    autoResolveErrors,
  };
}

async function journalSuccesses(
  input: {
    batch: BatchPrData;
    prNumber: number;
    repo: { owner: string; name: string };
    partition: BatchPartition;
  },
  autoResolved: AutoResolvedThread[],
  autoMinimized: AutoMinimizedItem[],
): Promise<string | undefined> {
  const body = ruleAutoResolveBody({
    threads: autoResolved.length,
    comments: autoMinimized.filter((item) => item.kind === "pr-comment").length,
    reviewSummaries: autoMinimized.filter((item) => item.kind === "review-summary").length,
  });
  if (!body) return undefined;
  const ids = [...autoResolved.map((thread) => thread.id), ...autoMinimized.map((item) => item.id)];
  const reasons = successReasons(ids, input.partition.ruleReasons);
  const item = formatRuleAutoResolveJournalItem({
    body,
    reasons,
    ...(input.batch.viewerLogin ? { viewerLogin: input.batch.viewerLogin } : {}),
    urls: [
      ...autoResolved.map((thread) => thread.url),
      ...autoMinimized.map((item) => item.url ?? ""),
    ],
  });
  try {
    await runJournal({
      prNumber: input.prNumber,
      targetRepository: { owner: input.repo.owner, name: input.repo.name },
      rawItem: item,
      dryRun: false,
    });
    return undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const clause = reasonClause(reasons);
    return clause ? `journal: ${message} ${clause}` : `journal: ${message}`;
  }
}
