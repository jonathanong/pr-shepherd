import { describe, it, expect } from "vitest";
import {
  BATCH_PR_QUERY,
  GET_PR_HEAD_SHA_QUERY,
  MULTI_PR_STATUS_QUERY,
  MULTI_PR_STATUS_QUERY_WITH_CURSOR,
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
