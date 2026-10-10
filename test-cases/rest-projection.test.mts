/**
 * Drift guard for the REST fixture projection. `test-helpers/test-cases/rest-projection.mts`
 * derives each fixture's REST variant by keeping only the keys the production REST reader can
 * emit. This runs the real reader (`fetchRestPrBatch` -> `readRestSnapshot`) with every optional
 * field populated and asserts the emitted key sets equal those allowlists, so a reader change
 * that adds or drops a field fails here instead of silently skewing every REST snapshot.
 */
import { describe, expect, it, vi } from "vitest";
import { comment, repo } from "../test-helpers/github/rest-read.test-support.mts";
import {
  serveRestSnapshot,
  suite,
  workflow,
  check,
} from "../test-helpers/github/rest-snapshot.test-support.mts";
import { fetchRestPrBatch } from "../src/github/rest-batch-read.mts";
import {
  REST_BATCH_KEYS,
  REST_THREAD_KEYS,
  REST_THREAD_COMMENT_KEYS,
  REST_COMMENT_KEYS,
  REST_REVIEW_KEYS,
} from "../test-helpers/test-cases/rest-projection.mts";

const review = (id: number, state: string, commitId = "aaa111") => ({
  id,
  node_id: `PRR_${id}`,
  state,
  body: `review ${id}`,
  html_url: `https://github.com/octocat/hello-world/pull/101#pullrequestreview-${id}`,
  submitted_at: "2026-10-09T00:00:00Z",
  commit_id: commitId,
  user: { login: `reviewer${id}`, type: "User" },
  author_association: "MEMBER",
});

function keysOf(items: object[] | undefined): Set<string> {
  return new Set((items ?? []).flatMap((item) => Object.keys(item)));
}

describe("REST fixture projection allowlists", () => {
  it("match the keys the production REST reader emits", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    const viewer = { login: "author", type: "User" };
    await serveRestSnapshot({
      pull: {
        auto_merge: { merge_method: "squash", enabled_by: { login: "author" } },
        requested_reviewers: [{ login: "reviewer" }],
      },
      checks: [check],
      suites: [suite],
      workflows: [workflow],
      inline: [
        { ...comment(11), user: viewer, start_line: 3 },
        comment(12, 11),
        // A resolved thread from the old-commit CHANGES_REQUESTED review marks that review stale.
        { ...comment(13), pull_request_review_id: 7 },
      ],
      threads: [
        {
          resolved: false,
          outdated: false,
          path: "src/index.mts",
          line: 5,
          comment_ids: [11, 12],
        },
        { resolved: true, outdated: false, path: "src/index.mts", line: 5, comment_ids: [13] },
      ],
      comments: [
        {
          id: 21,
          node_id: "IC_21",
          body: "issue comment",
          html_url: "https://github.com/octocat/hello-world/pull/101#issuecomment-21",
          created_at: "2026-10-09T00:00:00Z",
          updated_at: "2026-10-09T00:00:00Z",
          user: viewer,
          author_association: "MEMBER",
        },
      ],
      reviews: [
        review(7, "CHANGES_REQUESTED", "old000"),
        review(8, "COMMENTED"),
        review(9, "APPROVED"),
      ],
      stack: {
        number: 3,
        node_id: "ST_3",
        base: { ref: "main" },
        pull_requests: [{ number: 101 }],
      },
    });

    const { data } = await fetchRestPrBatch(101, repo);
    const reviews = [
      ...data.changesRequestedReviews,
      ...data.reviewSummaries,
      ...data.approvedReviews,
    ];

    expect(new Set(Object.keys(data))).toEqual(REST_BATCH_KEYS);
    expect(keysOf(data.reviewThreads)).toEqual(REST_THREAD_KEYS);
    expect(keysOf(data.reviewThreads.flatMap((thread) => thread.comments ?? []))).toEqual(
      REST_THREAD_COMMENT_KEYS,
    );
    expect(keysOf(data.comments)).toEqual(REST_COMMENT_KEYS);
    expect(keysOf(reviews)).toEqual(REST_REVIEW_KEYS);
  });
});
