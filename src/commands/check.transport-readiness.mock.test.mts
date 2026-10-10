import { describe, expect, it } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeComment,
  makeThread,
  mockFetchPrBatch,
  mockLoadSeenMap,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";
import { hashBody } from "../state/seen-comments.mts";
import { runWithGithubTransport } from "../github/transport.mts";

registerHooks();

describe("REST complete-evidence readiness", () => {
  it("rejects apparently ready data whose review transcript is unavailable", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        transport: "rest",
        transportUnavailable: [{ field: "reviewTranscripts", reason: "permission denied" }],
      }),
    });
    const report = await runWithGithubTransport("rest", () => runCheck(BASE_OPTS));
    expect(report.status).toBe("UNKNOWN");
    expect(report.transportUnavailable?.[0]?.field).toBe("reviewTranscripts");
  });

  it("requires transcript completeness even when the thread status is known", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        transport: "rest",
        reviewThreads: [makeThread({ isResolved: true, comments: undefined })],
      }),
    });
    const report = await runWithGithubTransport("rest", () => runCheck(BASE_OPTS));
    expect(report.status).toBe("UNKNOWN");
    expect(report.threads.firstLook).toMatchObject([{ id: "t1", firstLookStatus: "resolved" }]);
  });

  it("suppresses denied comment minimization and bot dismissal until their bodies change", async () => {
    const comment = makeComment();
    const review = {
      id: "review-denied",
      author: "coderabbitai",
      authorType: "Bot" as const,
      body: "needs revision",
      url: "https://github.com/owner/repo/pull/42#pullrequestreview-1",
    };
    mockLoadSeenMap.mockResolvedValue(
      new Map(
        [comment, review].map(({ id, body }) => [
          id,
          { seenAt: 1, bodyHash: hashBody(body), deniedMutationBodyHash: hashBody(body) },
        ]),
      ),
    );
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ comments: [comment], changesRequestedReviews: [review] }),
    });
    const unchanged = await runCheck(BASE_OPTS);
    expect(unchanged.comments.actionable).toEqual([]);
    expect(unchanged.comments.minimizeIds ?? []).toEqual([]);
    expect(unchanged.changesRequestedReviews).toEqual([]);
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        comments: [{ ...comment, body: "edited comment" }],
        changesRequestedReviews: [{ ...review, body: "edited review" }],
      }),
    });
    const edited = await runCheck(BASE_OPTS);
    expect(edited.comments.minimizeIds).toContain(comment.id);
    expect(edited.changesRequestedReviews).toMatchObject([{ id: review.id, edited: true }]);
  });
});
