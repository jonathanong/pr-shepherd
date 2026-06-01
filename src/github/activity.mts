import type {
  PrActivitySummary,
  PrComment,
  Review,
  ReviewActivityItem,
  ReviewThread,
} from "../types.mts";
import type { RawPr } from "./batch-raw-types.mts";
import { parseCreatedAt } from "./batch-parser-helpers.mts";

export function buildPrActivitySummary(
  raw: RawPr,
  comments: PrComment[],
  reviewThreads: ReviewThread[],
  reviewSummaries: Review[],
  changesRequestedReviews: Review[],
  approvedReviews: Review[],
): PrActivitySummary {
  const latestCommitCommittedAtUnix = raw.commits.nodes[0]?.commit.committedDate
    ? parseCreatedAt(raw.commits.nodes[0].commit.committedDate)
    : null;
  const reviewItemsSinceLatestCommit: ReviewActivityItem[] =
    latestCommitCommittedAtUnix === null
      ? []
      : [
          ...comments
            .filter((c) => c.createdAtUnix > latestCommitCommittedAtUnix)
            .map((c) => ({
              kind: "pr-comment" as const,
              id: c.id,
              author: c.author,
              authorType: c.authorType,
              body: c.body,
              url: c.url,
              createdAtUnix: c.createdAtUnix,
            })),
          ...reviewThreads.flatMap((t) =>
            (t.comments ?? [])
              .filter((c) => c.createdAtUnix > latestCommitCommittedAtUnix)
              .map((c) => ({
                kind: "review-thread-comment" as const,
                id: c.id,
                author: c.author,
                authorType: c.authorType,
                body: c.body,
                url: c.url,
                createdAtUnix: c.createdAtUnix,
                threadId: t.id,
                path: t.path,
                line: t.line,
              })),
          ),
          ...reviewSummaries
            .filter((r) => (r.createdAtUnix ?? 0) > latestCommitCommittedAtUnix)
            .map((r) => ({
              kind: "review-summary" as const,
              id: r.id,
              author: r.author,
              authorType: r.authorType,
              body: r.body,
              createdAtUnix: r.createdAtUnix ?? 0,
            })),
          ...changesRequestedReviews
            .filter((r) => (r.createdAtUnix ?? 0) > latestCommitCommittedAtUnix)
            .filter((r) => r.body.trim() !== "")
            .map((r) => ({
              kind: "changes-requested-review" as const,
              id: r.id,
              author: r.author,
              authorType: r.authorType,
              body: r.body,
              createdAtUnix: r.createdAtUnix ?? 0,
            })),
          ...approvedReviews
            .filter((r) => (r.createdAtUnix ?? 0) > latestCommitCommittedAtUnix)
            .filter((r) => r.body.trim() !== "")
            .map((r) => ({
              kind: "approved-review" as const,
              id: r.id,
              author: r.author,
              authorType: r.authorType,
              body: r.body,
              createdAtUnix: r.createdAtUnix ?? 0,
            })),
        ].sort((a, b) => a.createdAtUnix - b.createdAtUnix);

  return {
    commitCount: raw.commits.totalCount ?? raw.commits.nodes.length,
    reviewRoundCount: raw.allReviews?.totalCount ?? 0,
    latestCommitCommittedAtUnix,
    reviewItemsSinceLatestCommit,
  };
}
