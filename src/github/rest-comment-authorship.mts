import { mapAuthorType } from "./batch-parser-helpers.mts";
import type { RestComment } from "./rest-feedback-read.mts";

export function restCommentAuthorFields(comment: RestComment, viewerLogin?: string | null) {
  const login = typeof comment.user?.login === "string" ? comment.user.login : undefined;
  return {
    author: login ?? "unknown",
    authorType: mapAuthorType(comment.user?.type, login),
    ...(viewerLogin &&
      login?.toLowerCase() === viewerLogin.toLowerCase() && { viewerDidAuthor: true as const }),
    ...(comment.author_association && { authorAssociation: comment.author_association }),
  };
}
