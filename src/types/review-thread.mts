import type { AuthorType } from "./github.mts";

export interface ReviewThreadComment {
  id: string;
  isMinimized: boolean;
  author: string;
  authorType: AuthorType;
  body: string;
  url: string;
  createdAtUnix: number;
}
