import { classifyItem, type SeenMarker } from "../state/seen-comments.mts";
import { threadTranscriptBody } from "../threads/transcript.mts";
import {
  isConfiguredBotAuthor,
  isHumanAuthor,
  isViewerAuthoredHuman,
  type NormalizedBotUsernames,
} from "./authors.mts";
import { threadEndedByShepherd } from "./marker.mts";
import type { ResolveOtherHumanThreads } from "../config/load.mts";
import { shouldResolveOtherHumanThread } from "./thread-resolve-policy.mts";
import type { FirstLookThread, ReviewThread } from "../types.mts";

interface ThreadVisibility {
  activeThreads: ReviewThread[];
  resolutionOnlyThreads: ReviewThread[];
  firstLookThreads: FirstLookThread[];
  toMarkSeen: ReviewThread[];
}

function isOrdinaryHuman(thread: ReviewThread, botUsernames: NormalizedBotUsernames): boolean {
  return isHumanAuthor(thread) && !isConfiguredBotAuthor(thread, botUsernames);
}

function withEdited<T extends ReviewThread>(thread: T, edited: boolean): T {
  return edited ? { ...thread, edited: true } : thread;
}

function classifyVisibleThread(
  thread: ReviewThread,
  seenMap: Map<string, SeenMarker>,
): ReviewThread | null {
  const cls = classifyItem(thread.id, threadTranscriptBody(thread), seenMap);
  if (cls === "unchanged") return null;
  return withEdited(thread, cls === "edited");
}

function classifyFirstLookThread(
  thread: ReviewThread,
  seenMap: Map<string, SeenMarker>,
  firstLookStatus: FirstLookThread["firstLookStatus"],
): FirstLookThread | null {
  if (threadEndedByShepherd(thread)) return null;
  const visible = classifyVisibleThread(thread, seenMap);
  if (visible === null) return null;
  return { ...visible, firstLookStatus };
}

/** An unresolved, current thread whose author class makes it repeat while a mutation is authorized. */
function repeatsAsActive(
  thread: ReviewThread,
  ended: boolean,
  botUsernames: NormalizedBotUsernames,
  policy: ResolveOtherHumanThreads,
): boolean {
  if (thread.isOutdated !== false || thread.isMinimized === true || ended) return false;
  return (
    isConfiguredBotAuthor(thread, botUsernames) ||
    isViewerAuthoredHuman(thread, botUsernames) ||
    (isOrdinaryHuman(thread, botUsernames) && policy === "always")
  );
}

/** An unresolved thread that is resolution-only work: outdated, minimized or ended by Shepherd. */
function isResolutionOnlyCandidate(
  thread: ReviewThread,
  ended: boolean,
  botUsernames: NormalizedBotUsernames,
  policy: ResolveOtherHumanThreads,
): boolean {
  if (!ended) return thread.isOutdated === true || thread.isMinimized === true;
  if (!isOrdinaryHuman(thread, botUsernames)) return true;
  return (
    isViewerAuthoredHuman(thread, botUsernames) || shouldResolveOtherHumanThread(thread, policy)
  );
}

/**
 * Whether an unresolved thread with a known outdated state keeps returning every tick once seen,
 * given an authorized mutation. The compact summary calls this so its count cannot drift from
 * `classifyThreadVisibility`.
 */
export function unresolvedThreadRepeats(
  thread: ReviewThread,
  ended: boolean,
  botUsernames: NormalizedBotUsernames,
  policy: ResolveOtherHumanThreads,
): boolean {
  return (
    repeatsAsActive(thread, ended, botUsernames, policy) ||
    isResolutionOnlyCandidate(thread, ended, botUsernames, policy)
  );
}

export function classifyThreadVisibility(
  threads: ReviewThread[],
  seenMap: Map<string, SeenMarker>,
  botUsernames: NormalizedBotUsernames = new Set(),
  repeatableThreadIds?: ReadonlySet<string>,
  resolveOtherHumanThreads: ResolveOtherHumanThreads = "none",
): ThreadVisibility {
  const shouldRepeat = (thread: ReviewThread): boolean =>
    repeatableThreadIds?.has(thread.id) ?? true;
  const unknownStatusThreads = threads.filter(
    (thread) => thread.isResolved === undefined || thread.isOutdated === undefined,
  );
  const unresolvedThreads = threads.filter(
    (thread) => thread.isResolved === false && thread.isOutdated !== undefined,
  );
  const activeThreads = unresolvedThreads
    .filter((t) => t.isOutdated === false && t.isMinimized !== true)
    .flatMap((t) => {
      if (threadEndedByShepherd(t)) return [];
      if (repeatsAsActive(t, false, botUsernames, resolveOtherHumanThreads) && shouldRepeat(t))
        return [t];
      const visible = classifyVisibleThread(t, seenMap);
      return visible ? [visible] : [];
    });
  const resolutionOnlyThreads = unresolvedThreads
    .filter((t) =>
      isResolutionOnlyCandidate(
        t,
        threadEndedByShepherd(t),
        botUsernames,
        resolveOtherHumanThreads,
      ),
    )
    .flatMap((t) => {
      const visible = classifyVisibleThread(t, seenMap);
      if (visible) return [visible];
      return shouldRepeat(t) ? [t] : [];
    });
  const firstLookThreads: FirstLookThread[] = [
    ...threads.flatMap((t) => {
      if (t.isOutdated !== true || t.isResolved === undefined) return [];
      const visible = classifyFirstLookThread(t, seenMap, "outdated");
      return visible ? [visible] : [];
    }),
    ...threads.flatMap((t) => {
      if (t.isResolved !== true || t.isOutdated !== false) return [];
      const visible = classifyFirstLookThread(t, seenMap, "resolved");
      return visible ? [visible] : [];
    }),
    ...threads.flatMap((t) => {
      if (!t.isMinimized || t.isResolved !== false || t.isOutdated !== false) return [];
      const visible = classifyFirstLookThread(t, seenMap, "minimized");
      return visible ? [visible] : [];
    }),
    ...unknownStatusThreads.flatMap((thread) => {
      const visible = classifyFirstLookThread(thread, seenMap, "unknown");
      return visible ? [visible] : [];
    }),
  ];

  const seenMarkerIds = new Set<string>();
  const toMarkSeen = [...activeThreads, ...resolutionOnlyThreads, ...firstLookThreads].filter(
    (thread) => {
      if (seenMarkerIds.has(thread.id)) return false;
      seenMarkerIds.add(thread.id);
      return true;
    },
  );

  return { activeThreads, resolutionOnlyThreads, firstLookThreads, toMarkSeen };
}
