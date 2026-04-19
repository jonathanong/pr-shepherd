import { describe, it, expect } from "vitest";
import {
  BATCH_PR_QUERY,
  RESOLVE_THREAD_MUTATION,
  MINIMIZE_COMMENT_MUTATION,
  DISMISS_REVIEW_MUTATION,
  MULTI_PR_STATUS_QUERY,
  MULTI_PR_STATUS_QUERY_WITH_CURSOR,
} from "./queries.mts";

describe("queries — GQL constants load at import time", () => {
  it("BATCH_PR_QUERY is a non-empty query string", () => {
    expect(typeof BATCH_PR_QUERY).toBe("string");
    expect(BATCH_PR_QUERY.length).toBeGreaterThan(0);
    expect(BATCH_PR_QUERY).toContain("query");
  });

  it("RESOLVE_THREAD_MUTATION is a non-empty mutation string", () => {
    expect(typeof RESOLVE_THREAD_MUTATION).toBe("string");
    expect(RESOLVE_THREAD_MUTATION.length).toBeGreaterThan(0);
    expect(RESOLVE_THREAD_MUTATION).toContain("mutation");
    expect(RESOLVE_THREAD_MUTATION).toContain("$threadId");
  });

  it("MINIMIZE_COMMENT_MUTATION is a non-empty mutation string", () => {
    expect(typeof MINIMIZE_COMMENT_MUTATION).toBe("string");
    expect(MINIMIZE_COMMENT_MUTATION.length).toBeGreaterThan(0);
    expect(MINIMIZE_COMMENT_MUTATION).toContain("mutation");
    expect(MINIMIZE_COMMENT_MUTATION).toContain("$commentId");
  });

  it("DISMISS_REVIEW_MUTATION is a non-empty mutation string", () => {
    expect(typeof DISMISS_REVIEW_MUTATION).toBe("string");
    expect(DISMISS_REVIEW_MUTATION.length).toBeGreaterThan(0);
    expect(DISMISS_REVIEW_MUTATION).toContain("mutation");
    expect(DISMISS_REVIEW_MUTATION).toContain("$reviewId");
  });

  it("MULTI_PR_STATUS_QUERY is a non-empty query string", () => {
    expect(typeof MULTI_PR_STATUS_QUERY).toBe("string");
    expect(MULTI_PR_STATUS_QUERY.length).toBeGreaterThan(0);
    expect(MULTI_PR_STATUS_QUERY).toContain("query");
  });

  it("MULTI_PR_STATUS_QUERY_WITH_CURSOR is a non-empty query string", () => {
    expect(typeof MULTI_PR_STATUS_QUERY_WITH_CURSOR).toBe("string");
    expect(MULTI_PR_STATUS_QUERY_WITH_CURSOR.length).toBeGreaterThan(0);
    expect(MULTI_PR_STATUS_QUERY_WITH_CURSOR).toContain("query");
  });
});
