import { describe, expect, it } from "vitest";
import {
  BASE_OPTS,
  mockApplyResolveOptions,
  mockFindUnresolvedThreadsByReviewId,
  registerHooks,
} from "../../test-helpers/commands/resolve.test-support.mts";
import { applyReviewResultToExitCode, EXIT } from "../exit-codes.mts";
import { runResolveMutate } from "./resolve.mts";

registerHooks();

describe("runResolveMutate — unresolved inline thread guard", () => {
  it("refuses to dismiss or minimize a review while its inline threads are unresolved", async () => {
    mockFindUnresolvedThreadsByReviewId.mockResolvedValue(
      new Map([["PRR_1", ["PRRT_1", "PRRT_2"]]]),
    );

    const result = await runResolveMutate({
      ...BASE_OPTS,
      dismissReviewIds: ["PRR_1"],
      minimizeCommentIds: ["PRR_1"],
      dismissMessage: "Addressed feedback.",
    });

    expect(mockApplyResolveOptions).not.toHaveBeenCalled();
    expect(result.dismissedReviews).toEqual([]);
    expect(result.minimizedComments).toEqual([]);
    expect(result.errors).toEqual([
      "Refused to dismiss/hide review PRR_1: 2 unresolved inline threads remain (PRRT_1, PRRT_2). Resolve all inline threads first, then dismiss/hide the review in a separate command.",
    ]);
    expect(result.instructions?.[0]).toContain("Resolve every unresolved inline thread");
    expect(applyReviewResultToExitCode(result)).toBe(EXIT.UNAVAILABLE);
  });

  it("refuses to minimize a COMMENTED review (PRR_*) while its inline thread is unresolved", async () => {
    mockFindUnresolvedThreadsByReviewId.mockResolvedValue(new Map([["PRR_2", ["PRRT_9"]]]));

    const result = await runResolveMutate({
      ...BASE_OPTS,
      minimizeCommentIds: ["PRR_2"],
    });

    expect(mockApplyResolveOptions).not.toHaveBeenCalled();
    expect(result.errors[0]).toContain("Refused to dismiss/hide review PRR_2");
    expect(result.errors[0]).toContain("1 unresolved inline thread remains (PRRT_9)");
    expect(applyReviewResultToExitCode(result)).toBe(EXIT.UNAVAILABLE);
  });

  it("blocks dismissing a review even when its unresolved thread is passed to --resolve-thread-ids in the same call", async () => {
    mockFindUnresolvedThreadsByReviewId.mockResolvedValue(new Map([["PRR_1", ["PRRT_1"]]]));
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
    expect(result.resolvedThreads).toEqual(["PRRT_1"]);
    expect(result.dismissedReviews).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Refused to dismiss/hide review PRR_1");
    expect(applyReviewResultToExitCode(result)).toBe(EXIT.UNAVAILABLE);
  });

  it("does not query unresolved threads when only PR comments or threads are mutated", async () => {
    await runResolveMutate({
      ...BASE_OPTS,
      resolveThreadIds: ["PRRT_1"],
      minimizeCommentIds: ["IC_1"],
    });

    expect(mockFindUnresolvedThreadsByReviewId).not.toHaveBeenCalled();
    expect(mockApplyResolveOptions).toHaveBeenCalledTimes(1);
  });
});
