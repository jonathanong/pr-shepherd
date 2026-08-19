import { describe, it, expect } from "vitest";
import {
  BATCH_PR_QUERY,
  BATCH_PR_PAGE_QUERY,
  GET_PR_HEAD_SHA_QUERY,
  REVIEW_THREAD_COMMENTS_QUERY,
  COMMIT_SUGGESTION_THREAD_QUERY,
} from "./queries.mts";

describe("queries — GQL constants load at import time", () => {
  it("BATCH_PR_QUERY is a non-empty query string", () => {
    expect(typeof BATCH_PR_QUERY).toBe("string");
    expect(BATCH_PR_QUERY.length).toBeGreaterThan(0);
    expect(BATCH_PR_QUERY).toContain("query");
  });

  it("GET_PR_HEAD_SHA_QUERY is a non-empty query string targeting headRefOid", () => {
    expect(typeof GET_PR_HEAD_SHA_QUERY).toBe("string");
    expect(GET_PR_HEAD_SHA_QUERY.length).toBeGreaterThan(0);
    expect(GET_PR_HEAD_SHA_QUERY).toContain("query");
    expect(GET_PR_HEAD_SHA_QUERY).toContain("headRefOid");
  });

  it("requests raw author association for every surfaced comment and review path", () => {
    expect(BATCH_PR_QUERY.match(/\bauthorAssociation\b/g)).toHaveLength(5);
    expect(REVIEW_THREAD_COMMENTS_QUERY.match(/\bauthorAssociation\b/g)).toHaveLength(1);
    expect(BATCH_PR_PAGE_QUERY.match(/\bauthorAssociation\b/g)).toHaveLength(5);
  });

  it("uses @include on extra-page connections and omits unused first-page cursors", () => {
    expect(BATCH_PR_PAGE_QUERY).toContain("@include(if: $includeThreads)");
    expect(BATCH_PR_PAGE_QUERY).toContain("@include(if: $includeChecks)");
    expect(BATCH_PR_QUERY).not.toContain("$threadsCursor");
    expect(BATCH_PR_QUERY).toContain("checkSuites");
  });

  it("COMMIT_SUGGESTION_THREAD_QUERY selects node(id) plus PR head fields", () => {
    expect(COMMIT_SUGGESTION_THREAD_QUERY).toContain("node(id: $threadId)");
    expect(COMMIT_SUGGESTION_THREAD_QUERY).toContain("headRefOid");
  });
});
