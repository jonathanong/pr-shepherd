import { shouldMinimizeAuthor } from "./minimize-policy.mts";
import { classifyItem, type SeenMarker } from "../state/seen-comments.mts";
import type { MinimizeCommentsPolicy } from "../config/load.mts";
import type { ActionableComment, PrComment } from "../types.mts";
import type { NormalizedBotUsernames } from "./authors.mts";

interface VisibleCommentClassification {
  actionable: ActionableComment[];
  minimizeIds: string[];
  toMarkSeen: ActionableComment[];
}

export function classifyVisibleComments(
  comments: PrComment[],
  seenMap: Map<string, SeenMarker>,
  minimizeComments: MinimizeCommentsPolicy | undefined,
  botUsernames: NormalizedBotUsernames = new Set(),
): VisibleCommentClassification {
  const actionable: ActionableComment[] = [];
  const minimizeIds: string[] = [];
  const toMarkSeen: ActionableComment[] = [];
  for (const c of comments.filter((comment) => !comment.isMinimized)) {
    if (shouldMinimizeAuthor(c.authorType, minimizeComments, c.author, botUsernames)) {
      actionable.push(c);
      minimizeIds.push(c.id);
      continue;
    }
    const cls = classifyItem(c.id, c.body, seenMap);
    if (cls === "unchanged") continue;
    const comment = cls === "edited" ? { ...c, edited: true as const } : c;
    actionable.push(comment);
    toMarkSeen.push(comment);
  }
  return { actionable, minimizeIds, toMarkSeen };
}
