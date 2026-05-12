import { shouldMinimizeAuthor } from "./minimize-policy.mts";
import { classifyItem, type SeenMarker } from "../state/seen-comments.mts";
import type { MinimizeCommentsPolicy } from "../config/load.mts";
import type { PrComment } from "../types.mts";

export interface VisibleCommentClassification {
  actionable: PrComment[];
  minimizeIds: string[];
  toMarkSeen: PrComment[];
}

export function classifyVisibleComments(
  comments: PrComment[],
  seenMap: Map<string, SeenMarker>,
  minimizeComments: MinimizeCommentsPolicy | undefined,
): VisibleCommentClassification {
  const actionable: PrComment[] = [];
  const minimizeIds: string[] = [];
  const toMarkSeen: PrComment[] = [];
  for (const c of comments.filter((comment) => !comment.isMinimized)) {
    if (shouldMinimizeAuthor(c.authorType, minimizeComments)) {
      actionable.push(c);
      minimizeIds.push(c.id);
      continue;
    }
    const cls = classifyItem(c.id, c.body, seenMap);
    if (cls === "unchanged") continue;
    actionable.push(c);
    toMarkSeen.push(c);
  }
  return { actionable, minimizeIds, toMarkSeen };
}
