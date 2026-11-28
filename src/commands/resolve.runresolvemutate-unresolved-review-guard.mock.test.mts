import { describe, expect, it } from "vitest";
import {
  BASE_OPTS,
  mockApplyResolveOptions,
  mockCheckThreadsStillUnresolved,
  mockFindUnresolvedThreadsByReviewId,
  mockLoadSeenMap,
  mockMarkReviewUnresolvedThreads,
  mockPruneResolvedReviewThreads,
  registerHooks,
} from "../../test-helpers/commands/resolve.test-support.mts";
import { applyReviewResultToExitCode, EXIT } from "../exit-codes.mts";
import { runResolveMutate } from "./resolve.mts";

registerHooks();

describe("runResolveMutate — unresolved inline thread guard", () => {
  it("makes zero GitHub read calls when local state already knows all inline threads are resolved", async () => {
    mockLoadSeenMap.mockResolvedValue(
      new Map([["PRR_1", { seenAt: 1, id: "PRR_1", unresolvedInlineThreadIds: [] }]]),
    );

    await runResolveMutate({
      ...BASE_OPTS,
      dismissReviewIds: ["PRR_1"],
      minimizeCommentIds: ["PRR_1"],
      dismissMessage: "Addressed feedback.",
    });

    expect(mockCheckThreadsStillUnresolved).not.toHaveBeenCalled();
    expect(mockFindUnresolvedThreadsByReviewId).not.toHaveBeenCalled();
    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({
        dismissReviewIds: ["PRR_1"],
        minimizeCommentIds: ["PRR_1"],
      }),
    );
  });

  it("checks only cached unresolved thread IDs and refuses when any remain unresolved", async () => {
    mockLoadSeenMap.mockResolvedValue(
      new Map([
        ["PRR_1", { seenAt: 1, id: "PRR_1", unresolvedInlineThreadIds: ["PRRT_1", "PRRT_2"] }],
      ]),
    );
    mockCheckThreadsStillUnresolved.mockResolvedValue(new Set(["PRRT_1", "PRRT_2"]));

    const result = await runResolveMutate({
      ...BASE_OPTS,
      dismissReviewIds: ["PRR_1"],
      minimizeCommentIds: ["PRR_1"],
      dismissMessage: "Addressed feedback.",
    });

    expect(mockCheckThreadsStillUnresolved).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      ["PRRT_1", "PRRT_2"],
    );
    expect(mockFindUnresolvedThreadsByReviewId).not.toHaveBeenCalled();
    expect(mockApplyResolveOptions).not.toHaveBeenCalled();
    expect(result.errors).toEqual([
      "Refused to dismiss/hide review PRR_1: 2 unresolved inline threads remain (PRRT_1, PRRT_2). Resolve all inline threads first, then dismiss/hide the review in a separate command.",
    ]);
    expect(applyReviewResultToExitCode(result)).toBe(EXIT.UNAVAILABLE);
  });

  it("allows dismissing when cached unresolved threads were resolved outside pr-shepherd and updates local state", async () => {
    mockLoadSeenMap.mockResolvedValue(
      new Map([["PRR_1", { seenAt: 1, id: "PRR_1", unresolvedInlineThreadIds: ["PRRT_1"] }]]),
    );
    mockCheckThreadsStillUnresolved.mockResolvedValue(new Set());

    const result = await runResolveMutate({
      ...BASE_OPTS,
      dismissReviewIds: ["PRR_1"],
      minimizeCommentIds: ["PRR_1"],
      dismissMessage: "Addressed feedback.",
    });

    expect(mockCheckThreadsStillUnresolved).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      ["PRRT_1"],
    );
    expect(mockMarkReviewUnresolvedThreads).toHaveBeenCalledWith(
      { owner: "owner", repo: "repo", pr: 42 },
      "PRR_1",
      [],
    );
    expect(mockApplyResolveOptions).toHaveBeenCalledTimes(1);
    expect(result.errors).toEqual([]);
  });

  it("blocks dismissing a review even when its unresolved thread is passed to --resolve-thread-ids in the same call, then prunes resolved threads", async () => {
    mockLoadSeenMap.mockResolvedValue(
      new Map([["PRR_1", { seenAt: 1, id: "PRR_1", unresolvedInlineThreadIds: ["PRRT_1"] }]]),
    );
    mockCheckThreadsStillUnresolved.mockResolvedValue(new Set(["PRRT_1"]));
    mockApplyResolveOptions.mockResolvedValue({
      repliedThreads: [],
      resolvedThreads: ["PRRT_1"],
      minimizedComments: [],
      dismissedReviews: [],
      errors: [],
    });

    const result = await runResolveMutate({
      ...BASE_OPTS,
      resolveThreadIds: ["PRRT_1"],
      dismissReviewIds: ["PRR_1"],
      minimizeCommentIds: ["PRR_1", "IC_1"],
      dismissMessage: "Addressed feedback.",
    });

    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({
        resolveThreadIds: ["PRRT_1"],
        minimizeCommentIds: ["IC_1"],
        dismissReviewIds: [],
      }),
    );
    expect(mockPruneResolvedReviewThreads).toHaveBeenCalledWith(
      { owner: "owner", repo: "repo", pr: 42 },
      ["PRRT_1"],
    );
    expect(result.errors[0]).toContain("Refused to dismiss/hide review PRR_1");
    expect(applyReviewResultToExitCode(result)).toBe(EXIT.UNAVAILABLE);
  });

  it("falls back to findUnresolvedThreadsByReviewId only on cold cache and caches the result", async () => {
    mockFindUnresolvedThreadsByReviewId.mockResolvedValue(new Map([["PRR_2", ["PRRT_9"]]]));

    const result = await runResolveMutate({
      ...BASE_OPTS,
      minimizeCommentIds: ["PRR_2"],
    });

    expect(mockFindUnresolvedThreadsByReviewId).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      ["PRR_2"],
    );
    expect(mockMarkReviewUnresolvedThreads).toHaveBeenCalledWith(
      { owner: "owner", repo: "repo", pr: 42 },
      "PRR_2",
      ["PRRT_9"],
    );
    expect(mockApplyResolveOptions).not.toHaveBeenCalled();
    expect(applyReviewResultToExitCode(result)).toBe(EXIT.UNAVAILABLE);
  });

  it("does not query unresolved threads when only PR comments or threads are mutated", async () => {
    await runResolveMutate({
      ...BASE_OPTS,
      resolveThreadIds: ["PRRT_1"],
      minimizeCommentIds: ["IC_1"],
    });

    expect(mockCheckThreadsStillUnresolved).not.toHaveBeenCalled();
    expect(mockFindUnresolvedThreadsByReviewId).not.toHaveBeenCalled();
    expect(mockApplyResolveOptions).toHaveBeenCalledTimes(1);
  });
});
