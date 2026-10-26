import {
  buildThreadMutationRouting,
  threadHasAuthorizedMutation,
} from "../commands/iterate/thread-mutation-routing.mts";
import { normalizeAuthorType, type NormalizedBotUsernames } from "../comments/authors.mts";
import { threadEndedByShepherd } from "../comments/marker.mts";
import { unresolvedThreadRepeats } from "../comments/thread-visibility.mts";
import { classifyVisibleComments } from "../comments/visible-comments.mts";
import type { MinimizeCommentsPolicy, ResolveOtherHumanThreads } from "../config/load.mts";
import { mutationWasDenied, type SeenMarker } from "../state/seen-comments.mts";
import type { PrComment, ReviewThread } from "../types.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

type RawComment = RawSummaryPr["comments"]["nodes"][number];
type RawThread = RawSummaryPr["reviewThreads"]["nodes"][number];

const asPrComment = (c: RawComment): PrComment => ({
  id: c.id,
  isMinimized: c.isMinimized === true,
  ...(c.viewerCanMinimize !== undefined && { viewerCanMinimize: c.viewerCanMinimize }),
  author: c.author?.login ?? "unknown",
  authorType: normalizeAuthorType(c.author?.__typename, c.author?.login),
  body: c.body,
  url: c.url ?? "",
  createdAtUnix: 0,
});

/**
 * Count PR comments the full check would route to work, through the same classifier it uses: a new
 * comment, plus any seen comment eligible for minimization under `iterate.minimize-comments`.
 */
export function countCommentWork(
  eligible: RawComment[],
  unconfirmed: ReadonlySet<string>,
  seen: Map<string, SeenMarker>,
  minimizeComments: MinimizeCommentsPolicy | undefined,
  bots: NormalizedBotUsernames,
): number {
  const denied = new Set(
    eligible.filter((c) => mutationWasDenied(c.id, c.body, seen)).map((c) => c.id),
  );
  const work = new Set(
    classifyVisibleComments(
      eligible.map(asPrComment),
      seen,
      minimizeComments,
      bots,
      denied,
    ).actionable.map((c) => c.id),
  );
  // An edited PR comment is shown once by iterate but never blocks readiness.
  return eligible.filter((c) => work.has(c.id) || unconfirmed.has(c.id)).length;
}

export interface SummaryThreadView {
  thread: RawThread;
  root: RawThread["comments"]["nodes"][number] | undefined;
  truncated: boolean;
  transcript: string;
}

const asReviewThread = ({ thread, root, truncated }: SummaryThreadView): ReviewThread => {
  const author = root?.author?.login ?? "unknown";
  const authorType = normalizeAuthorType(root?.author?.__typename, root?.author?.login);
  return {
    id: thread.id,
    ...(thread.isResolved !== undefined && { isResolved: thread.isResolved }),
    ...(thread.isOutdated !== undefined && { isOutdated: thread.isOutdated }),
    isMinimized: root?.isMinimized === true,
    ...(thread.viewerCanReply !== undefined && { viewerCanReply: thread.viewerCanReply }),
    ...(thread.viewerCanResolve !== undefined && { viewerCanResolve: thread.viewerCanResolve }),
    path: thread.path,
    line: null,
    startLine: null,
    author,
    authorType,
    ...(root?.viewerDidAuthor === true && { viewerDidAuthor: true as const }),
    body: root?.body ?? "",
    url: "",
    // A window never shows a truncated thread's last comment, so it cannot prove the thread ended.
    comments: truncated
      ? []
      : thread.comments.nodes.map((c) => ({
          id: c.id,
          author: c.author?.login ?? "unknown",
          authorType: normalizeAuthorType(c.author?.__typename, c.author?.login),
          body: c.body,
          url: "",
          createdAtUnix: 0,
        })),
  };
};

/**
 * Unresolved thread ids that keep returning every tick once seen. This is the full check's
 * `classifyThreadVisibility` repeat rule, including `iterate.resolve-other-human-threads`,
 * shared rather than re-derived.
 */
export function repeatingThreadIds(
  views: SummaryThreadView[],
  seen: Map<string, SeenMarker>,
  bots: NormalizedBotUsernames,
  policy: ResolveOtherHumanThreads,
): Set<string> {
  const threads = views.map((view) => asReviewThread(view));
  const routing = buildThreadMutationRouting(threads, bots, [], policy);
  const replyIds = new Set(routing.replyThreadIds);
  const resolveIds = new Set(routing.resolveThreadIds);
  const repeating = new Set<string>();
  views.forEach((view, index) => {
    const thread = threads[index]!;
    if (thread.isResolved !== false || thread.isOutdated === undefined) return;
    if (mutationWasDenied(thread.id, view.transcript, seen)) return;
    if (!threadHasAuthorizedMutation(thread, replyIds, resolveIds)) return;
    const ended = !view.truncated && threadEndedByShepherd(thread);
    if (unresolvedThreadRepeats(thread, ended, bots, policy)) repeating.add(thread.id);
  });
  return repeating;
}
