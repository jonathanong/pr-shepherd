import type { AuthorType, CommentAuthorAssociation } from "./github.mts";

export interface AgentThreadComment {
  id: string;
  author: string;
  authorType?: AuthorType;
  authorAssociation?: CommentAuthorAssociation;
  viewerDidAuthor?: true;
  body: string;
  url: string;
}
