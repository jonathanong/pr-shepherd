import type { RestComment } from "./rest-feedback-read.mts";
import { restObject, restString, restNumber, malformedRest } from "./rest-reader-core.mts";

export function validateRestComments(comments: RestComment[]) {
  for (const comment of comments) {
    restObject(comment, "feedback comment");
    restString(comment.html_url, "feedback html_url");
    if (!("state" in comment)) {
      restString(comment.created_at, "comment created_at");
      restString(comment.updated_at, "comment updated_at");
      if (
        !Number.isFinite(Date.parse(comment.created_at)) ||
        !Number.isFinite(Date.parse(comment.updated_at))
      )
        malformedRest("feedback timestamps");
    }
    restNumber(comment.id, "feedback id");
    restString(comment.node_id, "feedback node_id");
    if (typeof comment.body !== "string" && comment.body !== null) malformedRest("feedback body");
  }
}

export function feedbackIdsMatch(
  inline: RestComment[],
  statuses: { comment_ids: number[] }[],
): boolean {
  const inlineIds = new Set(inline.map((comment) => comment.id));
  if (inlineIds.size !== inline.length) malformedRest("duplicate inline comment IDs");
  const threadIds = statuses.flatMap((status) => status.comment_ids);
  const covered = new Set(threadIds);
  if (covered.size !== threadIds.length) malformedRest("repeated CCR thread comment IDs");
  return covered.size === inlineIds.size && threadIds.every((id) => inlineIds.has(id));
}
