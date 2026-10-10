import { describe, expect, it, vi } from "vitest";
import { serve, comment, repo } from "../../test-helpers/github/rest-read.test-support.mts";
import { serveRestSnapshot } from "../../test-helpers/github/rest-snapshot.test-support.mts";
import { readRestFeedback } from "./rest-feedback-read.mts";
import { readRestRawThread } from "./rest-thread-read.mts";
import { recordThreadIdentity } from "./rest-identities.mts";

describe("REST feedback and thread boundaries", () => {
  it("retains an opaque thread handle, CCR status, review association and full dated transcript", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await recordThreadIdentity(repo, 101, "opaque-thread", 11);
    await serveRestSnapshot({
      inline: [{ ...comment(11), pull_request_review_id: 9 }, comment(12, 11)],
      reviews: [
        {
          ...comment(9),
          node_id: "PRR_9",
          state: "COMMENTED",
          commit_id: "aaa111",
          submitted_at: comment(9).created_at,
        },
      ],
      threads: [{ resolved: true, outdated: true, path: null, line: null, comment_ids: [11, 12] }],
    });
    const result = await readRestRawThread("opaque-thread");
    expect(result).toMatchObject({
      id: "opaque-thread",
      isResolved: true,
      isOutdated: true,
      path: null,
      comments: {
        pageInfo: { hasNextPage: false },
        nodes: [
          {
            id: "PRRC_11",
            createdAt: "2026-10-09T00:00:00.000Z",
            pullRequestReview: { id: "PRR_9" },
          },
          { id: "PRRC_12", body: "feedback 12" },
        ],
      },
    });
    expect(result).not.toHaveProperty("viewerCanResolve");
  });

  it("fails an absent explicit thread instead of substituting another transcript", async () => {
    await serveRestSnapshot({ inline: [comment(11)] });
    await expect(readRestRawThread("rest-thread-999", repo, 101)).rejects.toThrow(
      "absent from the REST snapshot",
    );
  });

  it.each(["comments", "reviews"])("rejects duplicate issue %s IDs", async (kind) => {
    const review = {
      ...comment(9),
      state: "COMMENTED",
      commit_id: "aaa111",
      submitted_at: comment(9).created_at,
    };
    await serveRestSnapshot(
      kind === "comments"
        ? { comments: [comment(11), comment(11)] }
        : { reviews: [review, review] },
    );
    await expect(readRestFeedback(101, repo)).rejects.toThrow("duplicate feedback IDs");
  });

  it("rejects invalid feedback timestamps", async () => {
    await serveRestSnapshot({ inline: [{ ...comment(11), updated_at: "not-a-date" }] });
    await expect(readRestFeedback(101, repo)).rejects.toThrow("feedback timestamps");
  });

  it("rejects orphan inline replies without inferring a thread root", async () => {
    await serveRestSnapshot({ inline: [comment(12, 11)] });
    await expect(readRestFeedback(101, repo)).rejects.toThrow("reply has no root");
  });

  it("rejects CCR replies associated with a different root", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serveRestSnapshot({
      inline: [comment(11), comment(12, 99)],
      threads: [
        { resolved: false, outdated: false, path: "src/index.mts", line: 5, comment_ids: [11, 12] },
      ],
    });
    await expect(readRestFeedback(101, repo)).rejects.toThrow("reply does not belong");
  });

  it.each([403, 404])(
    "handles unavailable CCR HTTP %i without claiming resolution",
    async (status) => {
      vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
      await serve((request, response) => {
        if (request.path.includes("ccr")) {
          response.statusCode = status;
          response.end('{"message":"Not accessible"}');
        } else
          response.end(
            JSON.stringify(request.path.includes("/pulls/101/comments") ? [comment(11)] : []),
          );
      });
      if (status === 403)
        await expect(readRestFeedback(101, repo)).rejects.toMatchObject({ status: 403 });
      else {
        const result = await readRestFeedback(101, repo);
        expect(result.threads[0]).not.toHaveProperty("isResolved");
        expect(result.unavailable).toContainEqual(
          expect.objectContaining({ field: "reviewThreads.status" }),
        );
      }
    },
  );
});
