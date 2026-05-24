import type { AuthorType } from "./github.mts";

export interface ReviewThreadComment {
  id: string;
  isMinimized: boolean;
  reviewId?: string;
  author: string;
  authorType: AuthorType;
  body: string;
  url: string;
  createdAtUnix: number;
}
