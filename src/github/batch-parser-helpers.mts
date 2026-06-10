import type { AuthorType, CheckConclusion, CheckStatus, Review, ReviewThread } from "../types.mts";
import { normalizeAuthorType } from "../comments/authors.mts";

export function mapAuthorType(
  typeName: string | undefined | null,
  login?: string | undefined | null,
): AuthorType {
  return normalizeAuthorType(typeName, login);
}

export function parseCreatedAt(iso: string): number {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

export function extractRunId(url: string | undefined | null): string | null {
  if (!url) return null;
  const m = /\/runs\/(\d+)/.exec(url);
  return m ? (m[1] ?? null) : null;
}

export function extractCheckRunSummary(
  title: string | null | undefined,
  summary: string | null | undefined,
): string | undefined {
  const t = title?.trim();
  if (t) return t;
  const firstLine = summary
    ?.split("\n")
    ?.find((l) => l.trim() !== "")
    ?.trim();
  return firstLine || undefined;
}

export function latestApprovedLogins(latest: Array<{ login: string; state: string }>): Set<string> {
  return new Set(
    latest
      .filter((r) => r.login !== "unknown" && (r.state === "APPROVED" || r.state === "DISMISSED"))
      .map((r) => r.login),
  );
}

/**
 * A CR review is stale when its commit.oid differs from the PR head AND every
 * associated review thread is resolved or outdated. Reviews with no associated
 * threads are treated conservatively (not marked stale).
 */
export function isReviewStale(
  review: Review,
  headRefOid: string,
  reviewThreads: ReviewThread[],
): boolean {
  if (!review.commitOid || review.commitOid === headRefOid) return false;
  const associated = reviewThreads.filter((t) => t.reviewId === review.id);
  if (associated.length === 0) return false;
  return associated.every((t) => t.isResolved || t.isOutdated);
}

export function mapStatusContextState(state: string): {
  status: CheckStatus;
  conclusion: CheckConclusion;
} {
  switch (state) {
    case "SUCCESS":
      return { status: "COMPLETED", conclusion: "SUCCESS" };
    case "FAILURE":
    case "ERROR":
      return { status: "COMPLETED", conclusion: "FAILURE" };
    case "PENDING":
    case "EXPECTED":
    default:
      return { status: "IN_PROGRESS", conclusion: null };
  }
}
