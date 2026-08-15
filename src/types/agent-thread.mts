import type { AuthorType, CommentAuthorAssociation } from "./github.mts";

export interface AgentThreadComment {
  id: string;
  author: string;
  authorType?: AuthorType;
  authorAssociation?: CommentAuthorAssociation;
  body: string;
  url: string;
}
