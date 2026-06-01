import type { AuthorType, CheckStatus } from "./github.mts";

type ReviewActivityKind = "pr-comment" | "review-thread-comment" | "review-summary";

interface ReviewActivityItem {
  kind: ReviewActivityKind;
  id: string;
  author: string;
  authorType: AuthorType;
  body: string;
  url?: string;
  createdAtUnix: number;
  threadId?: string;
  path?: string | null;
  line?: number | null;
}

export interface PrActivitySummary {
  commitCount: number;
  reviewRoundCount: number;
  latestCommitCommittedAtUnix: number | null;
  reviewItemsSinceLatestCommit: ReviewActivityItem[];
}

export interface ActiveCheck {
  name: string;
  status: CheckStatus;
  runId: string | null;
  detailsUrl: string | null;
  summary?: string;
}
