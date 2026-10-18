import { shouldMinimizeAuthor } from "./minimize-policy.mts";
import { classifyItem, type SeenMarker } from "../state/seen-comments.mts";
import type { MinimizeCommentsPolicy } from "../config/load.mts";
import type { ActionableComment, EditedComment, PrComment } from "../types.mts";
import type { NormalizedBotUsernames } from "./authors.mts";
import { canGenerateGithubMutation } from "../github/mutation-policy.mts";

interface VisibleCommentClassification {
  actionable: ActionableComment[];
  minimizeIds: string[];
  toMarkSeen: ActionableComment[];
  /** Seen comments whose body changed. Not readiness work; iterate surfaces and marks them. */
  edited: EditedComment[];
}

export function classifyVisibleComments(
  comments: PrComment[],
  seenMap: Map<string, SeenMarker>,
  minimizeComments: MinimizeCommentsPolicy | undefined,
  botUsernames: NormalizedBotUsernames = new Set(),
  deniedMinimizeIds: ReadonlySet<string> = new Set(),
): VisibleCommentClassification {
  const actionable: ActionableComment[] = [];
  const minimizeIds: string[] = [];
  const toMarkSeen: ActionableComment[] = [];
  const edited: EditedComment[] = [];
  for (const c of comments.filter((comment) => !comment.isMinimized)) {
    const cls = classifyItem(c.id, c.body, seenMap);
    // An edit is never readiness work, even when the comment is eligible for minimization.
    if (cls === "edited") {
      edited.push({ ...c, edited: true });
      continue;
    }
    if (
      !deniedMinimizeIds.has(c.id) &&
      canGenerateGithubMutation(c.viewerCanMinimize, "minimize") &&
      shouldMinimizeAuthor(c.authorType, minimizeComments, c.author, botUsernames)
    ) {
      actionable.push(c);
      minimizeIds.push(c.id);
      toMarkSeen.push(c); // prevents re-surfacing as first-look after GitHub marks it minimized
      continue;
    }
    if (cls === "unchanged") continue;
    actionable.push(c);
    toMarkSeen.push(c);
  }
  return { actionable, minimizeIds, toMarkSeen, edited };
}
