import type { AuthorType } from "./github.mts";

export interface AgentThreadComment {
  id: string;
  author: string;
  authorType?: AuthorType;
  body: string;
  url: string;
}
