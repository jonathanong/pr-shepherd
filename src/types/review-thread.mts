import type { AuthorType, CommentAuthorAssociation } from "./github.mts";

export interface ReviewThreadComment {
  id: string;
  isMinimized: boolean;
  reviewId?: string;
  author: string;
  authorType: AuthorType;
  authorAssociation?: CommentAuthorAssociation;
  viewerDidAuthor?: true;
  body: string;
  url: string;
  createdAtUnix: number;
}
