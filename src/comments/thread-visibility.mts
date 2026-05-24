import { classifyItem, type SeenMarker } from "../state/seen-comments.mts";
import { threadTranscriptBody } from "../threads/transcript.mts";
import { isConfiguredBotAuthor, type NormalizedBotUsernames } from "./authors.mts";
import type { FirstLookThread, ReviewThread } from "../types.mts";

interface ThreadVisibility {
  activeThreads: ReviewThread[];
  resolutionOnlyThreads: ReviewThread[];
  firstLookThreads: FirstLookThread[];
  toMarkSeen: ReviewThread[];
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
  const visible = classifyVisibleThread(thread, seenMap);
  if (visible === null) return null;
  return { ...visible, firstLookStatus };
}

export function classifyThreadVisibility(
  threads: ReviewThread[],
  seenMap: Map<string, SeenMarker>,
  botUsernames: NormalizedBotUsernames = new Set(),
): ThreadVisibility {
  const unresolvedThreads = threads.filter((t) => !t.isResolved);
  const activeThreads = unresolvedThreads
    .filter((t) => !t.isOutdated && !t.isMinimized)
    .flatMap((t) => {
      if (isConfiguredBotAuthor(t, botUsernames)) return [t];
      const visible = classifyVisibleThread(t, seenMap);
      return visible ? [visible] : [];
    });
  const resolutionOnlyThreads = unresolvedThreads
    .filter((t) => t.isOutdated || t.isMinimized)
    .flatMap((t) => {
      const visible = classifyVisibleThread(t, seenMap);
      return visible ? [visible] : [];
    });
  const firstLookThreads: FirstLookThread[] = [
    ...threads.flatMap((t) => {
      if (!t.isOutdated) return [];
      const visible = classifyFirstLookThread(t, seenMap, "outdated");
      return visible ? [visible] : [];
    }),
    ...threads.flatMap((t) => {
      if (!t.isResolved || t.isOutdated) return [];
      const visible = classifyFirstLookThread(t, seenMap, "resolved");
      return visible ? [visible] : [];
    }),
    ...threads.flatMap((t) => {
      if (!t.isMinimized || t.isResolved || t.isOutdated) return [];
      const visible = classifyFirstLookThread(t, seenMap, "minimized");
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
