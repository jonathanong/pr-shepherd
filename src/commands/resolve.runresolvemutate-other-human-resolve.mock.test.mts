import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeThread,
  mockApplyResolveOptions,
  mockFetchPrBatch,
  mockLoadConfig,
} from "../../test-helpers/commands/resolve.test-support.mts";
import { runResolveMutate } from "./resolve.mts";
import { addPrShepherdMarker } from "../comments/marker.mts";

function withOtherHumanResolve(policy: "none" | "outdated" | "always") {
  mockLoadConfig.mockReturnValue({
    botUsernames: ["coderabbitai"],
    ignoreChecks: [],
    iterate: {
      fixAttemptsPerThread: 3,
      stallTimeoutMinutes: 60,
      minimizeApprovals: false,
      minimizeComments: "all",
      behindBaseHint: "",
      resolveOtherHumanThreads: policy,
    },
    watch: { readyDelayMinutes: 10, graphqlQuotaWarnings: [] },
    resolve: { shaPoll: { intervalMs: 2000, maxAttempts: 10 } },
    checks: { ciTriggerEvents: ["pull_request", "pull_request_target"], ignoreLogLines: [] },
    mergeStatus: { blockingReviewerLogins: ["copilot"] },
    actions: {
      autoMinimizeSuppressed: true,
      autoMarkReady: true,
      neverCancelRuns: [],
      workWhileQueued: false,
    },
  });
}

registerHooks();

describe("runResolveMutate — other-human resolve policy", () => {
  it("does not extend the paired exception to another human's thread", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [makeThread({ id: "t-other", author: "bob", authorType: "User" })],
      }),
    });

    const result = await runResolveMutate({
      ...BASE_OPTS,
      replyThreadIds: ["t-other"],
      resolveThreadIds: ["t-other"],
      dismissMessage: "done",
    });

    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({
        replyThreadIds: ["t-other"],
        resolveThreadIds: [],
      }),
    );
    expect(result.skippedHumanResolves).toEqual(["t-other"]);
  });

  it("resolves another human's thread when iterate.resolveOtherHumanThreads is always", async () => {
    withOtherHumanResolve("always");
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [makeThread({ id: "t-other", author: "bob", authorType: "User" })],
      }),
    });

    const result = await runResolveMutate({
      ...BASE_OPTS,
      replyThreadIds: ["t-other"],
      resolveThreadIds: ["t-other"],
      dismissMessage: "done",
    });

    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({
        replyThreadIds: ["t-other"],
        resolveThreadIds: ["t-other"],
      }),
    );
    expect(result.skippedHumanResolves).toBeUndefined();
  });

  it("resolves an outdated other-human thread when the enum is outdated", async () => {
    withOtherHumanResolve("outdated");
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [
          makeThread({ id: "t-other", author: "bob", authorType: "User", isOutdated: true }),
        ],
      }),
    });

    const result = await runResolveMutate({
      ...BASE_OPTS,
      replyThreadIds: ["t-other"],
      resolveThreadIds: ["t-other"],
      dismissMessage: "done",
    });

    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({ resolveThreadIds: ["t-other"] }),
    );
    expect(result.skippedHumanResolves).toBeUndefined();
  });

  it("skips an active other-human resolve when the enum is outdated", async () => {
    withOtherHumanResolve("outdated");
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [makeThread({ id: "t-other", author: "bob", authorType: "User" })],
      }),
    });

    const result = await runResolveMutate({
      ...BASE_OPTS,
      replyThreadIds: ["t-other"],
      resolveThreadIds: ["t-other"],
      dismissMessage: "done",
    });

    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({ resolveThreadIds: [] }),
    );
    expect(result.skippedHumanResolves).toEqual(["t-other"]);
  });

  it("allows a marker-ended other-human resolve without another reply when always", async () => {
    withOtherHumanResolve("always");
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [
          makeThread({
            id: "t-other",
            author: "bob",
            authorType: "User",
            comments: [
              {
                id: "c-human",
                isMinimized: false,
                author: "bob",
                authorType: "User",
                body: "please fix",
                url: "",
                createdAtUnix: 1,
              },
              {
                id: "c-shepherd",
                isMinimized: false,
                author: "alice",
                authorType: "User",
                body: addPrShepherdMarker("done"),
                url: "",
                createdAtUnix: 2,
              },
            ],
          }),
        ],
      }),
    });

    const result = await runResolveMutate({
      ...BASE_OPTS,
      resolveThreadIds: ["t-other"],
    });

    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({ resolveThreadIds: ["t-other"] }),
    );
    expect(result.skippedHumanResolves).toBeUndefined();
  });
});
