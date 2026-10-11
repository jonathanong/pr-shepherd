import { describe, expect, it } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeComment,
  makeThread,
  mockFetchPrBatch,
  mockGetMergeableState,
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

  // reviewDecision is never a readiness input (approvals come from branch policy and latest
  // reviews), so its absence must not turn a non-CLEAN READY into UNKNOWN on REST.
  it.each(["BLOCKED", "UNSTABLE"] as const)(
    "keeps %s READY when only the aggregate reviewDecision is unavailable",
    async (mergeStateStatus) => {
      mockGetMergeableState.mockResolvedValue({ mergeable: "MERGEABLE", mergeStateStatus });
      mockFetchPrBatch.mockResolvedValue({
        data: makeBatchData({
          mergeStateStatus,
          reviewDecision: null,
          transport: "rest",
          transportUnavailable: [{ field: "reviewDecision", reason: "REST has no aggregate" }],
        }),
      });
      const report = await runWithGithubTransport("rest", () => runCheck(BASE_OPTS));
      expect(report.status).toBe("READY");
    },
  );

  it("still rejects a non-CLEAN READY whose branch policy is unavailable", async () => {
    mockGetMergeableState.mockResolvedValue({
      mergeable: "MERGEABLE",
      mergeStateStatus: "BLOCKED",
    });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        mergeStateStatus: "BLOCKED",
        reviewDecision: null,
        transport: "rest",
        transportUnavailable: [{ field: "branchProtection", reason: "HTTP 403" }],
      }),
    });
    const report = await runWithGithubTransport("rest", () => runCheck(BASE_OPTS));
    expect(report.status).toBe("UNKNOWN");
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
