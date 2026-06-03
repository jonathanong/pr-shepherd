import { describe, expect, it } from "vitest";
import { buildClassifyIndex, partitionBatch } from "./apply.mts";
import type { LoadedRule } from "./loader.mts";
import type { BatchPrData } from "../types.mts";
import type { ClassifyItem } from "./types.mts";

function makeThread(
  id: string,
  author = "bot",
  body = "hello",
): BatchPrData["reviewThreads"][number] {
  return {
    id,
    author,
    authorType: "Bot" as const,
    body,
    url: `https://github.com/t/${id}`,
    path: "file.ts",
    line: 1,
    startLine: null,
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
  };
}

function makeComment(id: string, author = "bot", body = "hello"): BatchPrData["comments"][number] {
  return {
    id,
    author,
    authorType: "Bot" as const,
    body,
    url: `https://github.com/c/${id}`,
    isMinimized: false,
    createdAtUnix: 0,
  };
}

function makeReview(
  id: string,
  author = "bot",
  body = "hello",
): BatchPrData["reviewSummaries"][number] {
  return { id, author, authorType: "Bot" as const, body };
}

function makeBatch(overrides: Partial<BatchPrData> = {}): BatchPrData {
  return {
    nodeId: "PR_1",
    number: 1,
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    headRefOid: "abc",
    headRefName: "feat",
    headRepoWithOwner: "owner/repo",
    baseRefName: "main",
    reviewRequests: [],
    latestReviews: [],
    reviewThreads: [],
    comments: [],
    changesRequestedReviews: [],
    reviewSummaries: [],
    approvedReviews: [],
    checks: [],
    branchProtection: null,
    ...overrides,
  };
}

function makeRule(
  name: string,
  fn: (item: ClassifyItem) => ReturnType<LoadedRule["rule"]>,
): LoadedRule {
  return { name, file: `/rules/${name}.mjs`, rule: fn };
}

describe("buildClassifyIndex", () => {
  it("returns empty sets when rules list is empty", () => {
    const idx = buildClassifyIndex([], makeBatch({ reviewThreads: [makeThread("t1")] }));
    expect(idx.suppressedIds.size).toBe(0);
    expect(idx.autoResolveIds.size).toBe(0);
  });

  it("suppresses matching review threads", () => {
    const rule = makeRule("r", (item) =>
      item.kind === "review-thread" && item.author === "bot" ? { suppress: true } : null,
    );
    const idx = buildClassifyIndex(
      [rule],
      makeBatch({ reviewThreads: [makeThread("t1"), makeThread("t2", "human")] }),
    );
    expect(idx.suppressedIds).toContain("t1");
    expect(idx.suppressedIds).not.toContain("t2");
  });

  it("auto-resolves matching pr-comments", () => {
    const rule = makeRule("r", (item) =>
      item.kind === "pr-comment" ? { autoResolve: true, suppress: true } : null,
    );
    const idx = buildClassifyIndex(
      [rule],
      makeBatch({ comments: [makeComment("c1"), makeComment("c2")] }),
    );
    expect(idx.autoResolveIds).toContain("c1");
    expect(idx.autoResolveIds).toContain("c2");
  });

  it("suppresses matching review summaries", () => {
    const rule = makeRule("r", (item) =>
      item.kind === "review-summary" && /quota/i.test(item.body)
        ? { suppress: true, autoResolve: true }
        : null,
    );
    const batch = makeBatch({
      reviewSummaries: [
        makeReview("r1", "gemini-code-assist", "You have reached your daily quota limit."),
      ],
    });
    const idx = buildClassifyIndex([rule], batch);
    expect(idx.suppressedIds).toContain("r1");
    expect(idx.autoResolveIds).toContain("r1");
  });

  it("suppresses matching changes-requested reviews but never auto-resolves them", () => {
    const rule = makeRule("r", (item) =>
      item.kind === "changes-requested" ? { suppress: true, autoResolve: true } : null,
    );
    const batch = makeBatch({ changesRequestedReviews: [makeReview("rev1")] });
    const idx = buildClassifyIndex([rule], batch);
    expect(idx.suppressedIds).toContain("rev1");
    expect(idx.autoResolveIds).not.toContain("rev1");
  });

  it("non-matching rule leaves changes-requested reviews unsuppressed", () => {
    const rule = makeRule("r", (item) => (item.kind === "pr-comment" ? { suppress: true } : null));
    const batch = makeBatch({ changesRequestedReviews: [makeReview("rev1")] });
    const idx = buildClassifyIndex([rule], batch);
    expect(idx.suppressedIds).not.toContain("rev1");
  });

  it("catches errors thrown by rules and continues", () => {
    const throwing = makeRule("bad", () => {
      throw new Error("boom");
    });
    const good = makeRule("good", (item) =>
      item.kind === "pr-comment" ? { suppress: true } : null,
    );
    const idx = buildClassifyIndex([throwing, good], makeBatch({ comments: [makeComment("c1")] }));
    expect(idx.suppressedIds).toContain("c1");
  });

  it("logs rule name and non-Error exception message to stderr", () => {
    const throwing = makeRule("bad", () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw "string error";
    });
    const idx = buildClassifyIndex([throwing], makeBatch({ comments: [makeComment("c1")] }));
    expect(idx.suppressedIds.size).toBe(0);
  });

  it("ORs results across multiple rules", () => {
    const suppressOnly = makeRule("s", (item) => (item.id === "c1" ? { suppress: true } : null));
    const resolveOnly = makeRule("r", (item) => (item.id === "c1" ? { autoResolve: true } : null));
    const idx = buildClassifyIndex(
      [suppressOnly, resolveOnly],
      makeBatch({ comments: [makeComment("c1")] }),
    );
    expect(idx.suppressedIds).toContain("c1");
    expect(idx.autoResolveIds).toContain("c1");
  });
});

describe("partitionBatch", () => {
  it("returns correct suppressed and auto-resolve ID sets", () => {
    const rule = makeRule("r", (item) =>
      item.author === "bot" ? { suppress: true, autoResolve: true } : null,
    );
    const batch = makeBatch({
      comments: [makeComment("c1"), makeComment("c2", "human")],
      reviewThreads: [makeThread("t1"), makeThread("t2", "human")],
      reviewSummaries: [makeReview("r1"), makeReview("r2", "human")],
      changesRequestedReviews: [makeReview("cr1")],
    });
    const idx = buildClassifyIndex([rule], batch);
    const p = partitionBatch(idx, batch);
    expect(p.suppressedCommentIds).toContain("c1");
    expect(p.suppressedCommentIds).not.toContain("c2");
    expect(p.suppressedThreadIds).toContain("t1");
    expect(p.suppressedReviewSummaryIds).toContain("r1");
    expect(p.suppressedChangesRequestedIds).toContain("cr1");
    expect(p.ruleAutoResolveCommentIds).toContain("c1");
    expect(p.ruleAutoResolveThreadIds).toContain("t1");
    expect(p.ruleAutoResolveReviewSummaryIds).toContain("r1");
    // changes-requested autoResolve is not propagated
    expect(p.ruleAutoResolveReviewSummaryIds).not.toContain("cr1");
  });

  it("returns empty partition for empty rules", () => {
    const batch = makeBatch({ comments: [makeComment("c1")], reviewThreads: [makeThread("t1")] });
    const idx = buildClassifyIndex([], batch);
    const p = partitionBatch(idx, batch);
    expect(p.suppressedCommentIds.size).toBe(0);
    expect(p.ruleAutoResolveThreadIds).toHaveLength(0);
  });

  it("only includes autoResolve IDs when both suppress and autoResolve are true", () => {
    const suppressOnly = makeRule("s", (item) => (item.id === "c1" ? { suppress: true } : null));
    const batch = makeBatch({ comments: [makeComment("c1")] });
    const idx = buildClassifyIndex([suppressOnly], batch);
    const p = partitionBatch(idx, batch);
    expect(p.suppressedCommentIds).toContain("c1");
    expect(p.ruleAutoResolveCommentIds).not.toContain("c1");
  });

  it("suppress-only review summary does not appear in ruleAutoResolveReviewSummaryIds", () => {
    const suppressOnly = makeRule("s", (item) =>
      item.kind === "review-summary" ? { suppress: true } : null,
    );
    const batch = makeBatch({ reviewSummaries: [makeReview("r1"), makeReview("r2")] });
    const idx = buildClassifyIndex([suppressOnly], batch);
    const p = partitionBatch(idx, batch);
    expect(p.suppressedReviewSummaryIds).toContain("r1");
    expect(p.ruleAutoResolveReviewSummaryIds).not.toContain("r1");
    expect(p.ruleAutoResolveReviewSummaryIds).toHaveLength(0);
  });

  it("autoResolve without suppress queues comment and review summary for auto-resolve", () => {
    const resolveOnly = makeRule("r", (item) =>
      item.kind === "pr-comment" || item.kind === "review-summary" ? { autoResolve: true } : null,
    );
    const batch = makeBatch({
      comments: [makeComment("c1")],
      reviewSummaries: [makeReview("r1")],
    });
    const idx = buildClassifyIndex([resolveOnly], batch);
    const p = partitionBatch(idx, batch);
    expect(p.suppressedCommentIds).not.toContain("c1");
    expect(p.suppressedReviewSummaryIds).not.toContain("r1");
    expect(p.ruleAutoResolveCommentIds).toContain("c1");
    expect(p.ruleAutoResolveReviewSummaryIds).toContain("r1");
  });

  it("skips already-resolved and outdated threads in ruleAutoResolveThreadIds", () => {
    const rule = makeRule("r", () => ({ autoResolve: true }));
    const batch = makeBatch({
      reviewThreads: [
        makeThread("t-open"),
        { ...makeThread("t-resolved"), isResolved: true },
        { ...makeThread("t-outdated"), isOutdated: true },
      ],
    });
    const idx = buildClassifyIndex([rule], batch);
    const p = partitionBatch(idx, batch);
    expect(p.ruleAutoResolveThreadIds).toContain("t-open");
    expect(p.ruleAutoResolveThreadIds).not.toContain("t-resolved");
    expect(p.ruleAutoResolveThreadIds).not.toContain("t-outdated");
  });
});
