import type { Review } from "../types.mts";

export interface ReviewOrderingEntry {
  id: string;
  author: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "DISMISSED" | "COMMENTED";
  body?: string;
  createdAtUnix?: number;
}

function normalizeAuthor(author: string | undefined | null): string {
  const normalized = (author ?? "").trim().toLowerCase();
  return normalized === "unknown" ? "" : normalized;
}

/**
 * Return the IDs of `APPROVED` reviews that are no longer the latest review from
 * their author — either because the same author posted a later `APPROVED` review
 * or because they posted a later substantive review (`CHANGES_REQUESTED`,
 * `DISMISSED`, or non-empty `COMMENTED`). Empty-body `COMMENTED` reviews (GitHub's
 * wrapper for inline thread replies) never supersede an approval.
 */
export function findSupersededApprovalIds(input: {
  reviews: readonly ReviewOrderingEntry[];
  latestReviews?: ReadonlyArray<{ login: string; state: string }>;
  precomputedSupersededIds?: ReadonlySet<string>;
}): Set<string> {
  const superseded = new Set<string>(input.precomputedSupersededIds);
  const approvalsByAuthor = new Map<
    string,
    Array<{ id: string; createdAtUnix: number; order: number }>
  >();
  const latestNonApprovalAtByAuthor = new Map<string, number>();

  input.reviews.forEach((review, order) => {
    const author = normalizeAuthor(review.author);
    if (!author) return;
    const createdAtUnix = review.createdAtUnix ?? 0;
    if (review.state === "APPROVED") {
      const list = approvalsByAuthor.get(author) ?? [];
      list.push({ id: review.id, createdAtUnix, order });
      approvalsByAuthor.set(author, list);
      return;
    }
    if (review.state === "COMMENTED" && (review.body ?? "").trim() === "") return;
    const prev = latestNonApprovalAtByAuthor.get(author);
    if (prev === undefined || createdAtUnix > prev) {
      latestNonApprovalAtByAuthor.set(author, createdAtUnix);
    }
  });

  const latestOpinionatedState = new Map<string, string>();
  for (const entry of input.latestReviews ?? []) {
    const author = normalizeAuthor(entry.login);
    if (author) latestOpinionatedState.set(author, entry.state);
  }

  for (const [author, approvals] of approvalsByAuthor) {
    const precomputed = input.precomputedSupersededIds;
    const isBetterLatest = (
      candidate: { id: string; createdAtUnix: number; order: number },
      current: { id: string; createdAtUnix: number; order: number },
    ): boolean => {
      if (candidate.createdAtUnix !== current.createdAtUnix) {
        return candidate.createdAtUnix > current.createdAtUnix;
      }
      const candPre = precomputed?.has(candidate.id) === true;
      const curPre = precomputed?.has(current.id) === true;
      if (candPre !== curPre) return !candPre;
      return candidate.order > current.order;
    };
    let latest = approvals[0]!;
    for (let i = 1; i < approvals.length; i++) {
      const candidate = approvals[i]!;
      if (isBetterLatest(candidate, latest)) {
        latest = candidate;
      }
    }
    const latestNonApprovalAt = latestNonApprovalAtByAuthor.get(author);
    const opinionatedState = latestOpinionatedState.get(author);
    const nonApprovalLatest =
      opinionatedState === "CHANGES_REQUESTED" || opinionatedState === "DISMISSED";

    for (const approval of approvals) {
      if (approval.id !== latest.id) {
        superseded.add(approval.id);
        continue;
      }
      if (
        (latestNonApprovalAt !== undefined && latestNonApprovalAt > approval.createdAtUnix) ||
        nonApprovalLatest
      ) {
        superseded.add(approval.id);
      }
    }
  }

  return superseded;
}

export function reviewOrderingEntriesFromReviews(input: {
  approvedReviews: readonly Review[];
  changesRequestedReviews: readonly Review[];
  reviewSummaries: readonly Review[];
}): ReviewOrderingEntry[] {
  return [
    ...input.approvedReviews.map((r) => ({
      id: r.id,
      author: r.author,
      state: "APPROVED" as const,
      body: r.body,
      createdAtUnix: r.createdAtUnix,
    })),
    ...input.changesRequestedReviews.map((r) => ({
      id: r.id,
      author: r.author,
      state: "CHANGES_REQUESTED" as const,
      body: r.body,
      createdAtUnix: r.createdAtUnix,
    })),
    ...input.reviewSummaries.map((r) => ({
      id: r.id,
      author: r.author,
      state: "COMMENTED" as const,
      body: r.body,
      createdAtUnix: r.createdAtUnix,
    })),
  ];
}
