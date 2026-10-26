import type { BatchPartition } from "../classify/apply.mts";
import type { ClassifyAction } from "../classify/types.mts";
import { normalizeAuthorType } from "../comments/authors.mts";
import { buildRuleAutoResolveReport } from "../commands/rule-auto-resolve-format.mts";
import { applySuppressedRuleAutoResolve } from "../commands/rule-auto-resolve.mts";
import { markSeen, mutationWasDenied, type SeenMarker } from "../state/seen-comments.mts";
import { threadTranscriptBodies } from "../threads/transcript.mts";
import type { PollSummaryRuleAutoResolve, ReviewThread } from "../types.mts";
import { canGenerateGithubMutation } from "./mutation-policy.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

type RawThread = RawSummaryPr["reviewThreads"]["nodes"][number];

export interface SummaryStateKey {
  owner: string;
  repo: string;
  pr: number;
}

export interface SummaryRuleActions {
  comments: ReadonlyMap<string, ClassifyAction>;
  summaries: ReadonlyMap<string, ClassifyAction>;
  threads: ReadonlyMap<string, ClassifyAction>;
}

export interface SummaryAutoResolve {
  /** Items whose mutation GitHub confirmed this tick. */
  confirmed: ReadonlySet<string>;
  /** Items Shepherd may mutate whose mutation was not confirmed; the full check still has work. */
  unconfirmed: ReadonlySet<string>;
  report?: PollSummaryRuleAutoResolve;
}

const NONE: SummaryAutoResolve = { confirmed: new Set(), unconfirmed: new Set() };

function matchesAutoResolve(action: ClassifyAction | undefined): action is ClassifyAction {
  return action?.suppress === true && action.autoResolve === true;
}

function toReviewThread(thread: RawThread): ReviewThread {
  const root = thread.comments.nodes[0];
  return {
    id: thread.id,
    ...(thread.isResolved !== undefined && { isResolved: thread.isResolved }),
    ...(thread.isOutdated !== undefined && { isOutdated: thread.isOutdated }),
    ...(thread.viewerCanResolve !== undefined && { viewerCanResolve: thread.viewerCanResolve }),
    path: thread.path ?? root?.path ?? null,
    line: thread.line ?? null,
    startLine: thread.startLine ?? null,
    author: root?.author?.login ?? "unknown",
    authorType: normalizeAuthorType(root?.author?.__typename, root?.author?.login),
    body: root?.body ?? "",
    url: root?.url ?? "",
  };
}

/** The transcript the full check hashes is complete only when the window holds every comment. */
function threadDenied(thread: RawThread, seen: Map<string, SeenMarker>): boolean {
  const transcript = threadTranscriptBodies(thread.comments.nodes.map((comment) => comment.body));
  return thread.comments.pageInfo.hasPreviousPage
    ? seen.get(thread.id)?.deniedMutationBodyHash !== undefined
    : mutationWasDenied(thread.id, transcript, seen);
}

/** Patch the read to match GitHub so a stack handoff does not replay the mutation. */
function patchRaw(raw: RawSummaryPr, confirmed: ReadonlySet<string>): void {
  for (const comment of [...raw.comments.nodes, ...raw.reviews.nodes])
    if (confirmed.has(comment.id)) comment.isMinimized = true;
  for (const thread of raw.reviewThreads.nodes)
    if (confirmed.has(thread.id)) thread.isResolved = true;
}

/**
 * Apply the rule-driven auto-resolve the one-PR check performs: minimize matching PR comments and
 * COMMENTED review summaries, resolve matching unresolved threads. Capability, denial, and marker
 * handling mirror `check.mts`; a denied item is left to the normal first-look gate.
 */
export async function applySummaryRuleAutoResolve(input: {
  raw: RawSummaryPr;
  actions: SummaryRuleActions;
  seen: Map<string, SeenMarker>;
  key: SummaryStateKey;
}): Promise<SummaryAutoResolve> {
  const { raw, actions, seen, key } = input;
  const comments = raw.comments.nodes.filter(
    (comment) =>
      !comment.isMinimized &&
      matchesAutoResolve(actions.comments.get(comment.id)) &&
      !mutationWasDenied(comment.id, comment.body, seen) &&
      canGenerateGithubMutation(comment.viewerCanMinimize, "minimize"),
  );
  const summaries = raw.reviews.nodes.filter(
    (review) =>
      !review.isMinimized &&
      matchesAutoResolve(actions.summaries.get(review.id)) &&
      !mutationWasDenied(review.id, review.body, seen) &&
      canGenerateGithubMutation(review.viewerCanMinimize, "minimize"),
  );
  const threads = raw.reviewThreads.nodes.filter(
    (thread) =>
      thread.isResolved === false &&
      thread.isOutdated !== true &&
      matchesAutoResolve(actions.threads.get(thread.id)) &&
      !threadDenied(thread, seen) &&
      canGenerateGithubMutation(thread.viewerCanResolve, "resolve"),
  );
  if (comments.length + summaries.length + threads.length === 0) return NONE;
  // The full check marks every non-denied suppressed item before it mutates, whatever the outcome.
  await Promise.allSettled([
    ...[...comments, ...summaries].map((item) => markSeen(key, item.id, item.body)),
    ...threads
      .filter((thread) => !thread.comments.pageInfo.hasPreviousPage)
      .map((thread) =>
        markSeen(
          key,
          thread.id,
          threadTranscriptBodies(thread.comments.nodes.map((comment) => comment.body)),
        ),
      ),
  ]);
  const reviewThreads = threads.map(toReviewThread);
  const reasonOf = (id: string, map: ReadonlyMap<string, ClassifyAction>): [string, string[]] => {
    const reason = map.get(id)?.reason;
    return [id, reason ? [reason] : []];
  };
  const ruleReasons = new Map([
    ...comments.map((item) => reasonOf(item.id, actions.comments)),
    ...summaries.map((item) => reasonOf(item.id, actions.summaries)),
    ...threads.map((item) => reasonOf(item.id, actions.threads)),
  ]);
  const partition: BatchPartition = {
    suppressedCommentIds: new Set(comments.map((item) => item.id)),
    suppressedThreadIds: new Set(threads.map((item) => item.id)),
    suppressedReviewSummaryIds: new Set(summaries.map((item) => item.id)),
    suppressedChangesRequestedIds: new Set(),
    ruleAutoResolveCommentIds: comments.map((item) => item.id),
    ruleAutoResolveThreadIds: threads.map((item) => item.id),
    ruleAutoResolveReviewSummaryIds: summaries.map((item) => item.id),
    ruleReasons,
  };
  const applied = await applySuppressedRuleAutoResolve({
    enabled: true,
    partition,
    batch: { comments, reviewSummaries: summaries, reviewThreads },
  });
  const confirmed = new Set([
    ...applied.autoMinimized.map((item) => item.id),
    ...applied.autoResolved.map((thread) => thread.id),
  ]);
  patchRaw(raw, confirmed);
  const full = buildRuleAutoResolveReport({
    threads: applied.autoResolved,
    minimized: applied.autoMinimized,
    errors: applied.autoResolveErrors,
    errorReasons: applied.errorReasons,
  });
  const report: PollSummaryRuleAutoResolve | undefined = full && {
    ...full,
    ...(full.threads && {
      threads: full.threads.map((thread) => ({
        id: thread.id,
        ...(thread.url && { url: thread.url }),
      })),
    }),
  };
  const unconfirmed = [...ruleReasons.keys()].filter((id) => !confirmed.has(id));
  return { confirmed, unconfirmed: new Set(unconfirmed), ...(report && { report }) };
}
