import { describe, expect, it } from "vitest";
import {
  BATCH_PR_PAGE_QUERY,
  BATCH_PR_QUERY,
  REVIEW_THREAD_COMMENTS_QUERY,
  SUGGESTION_THREADS_QUERY,
} from "./queries.mts";

describe("inline review viewer authorship queries", () => {
  it("select viewerDidAuthor on every inline comment path", () => {
    expect(BATCH_PR_QUERY).toContain("viewerDidAuthor");
    expect(BATCH_PR_PAGE_QUERY).toContain("viewerDidAuthor");
    expect(REVIEW_THREAD_COMMENTS_QUERY).toContain("viewerDidAuthor");
    expect(SUGGESTION_THREADS_QUERY).toContain("viewerDidAuthor");
  });
});
