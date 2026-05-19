import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  mockApplyResolveOptions,
  mockFetchPrBatch,
} from "./resolve.test-support.mts";
import { runResolveMutate } from "./resolve.mts";

registerHooks();

describe("runResolveMutate — forwards options", () => {
  it("forwards all IDs and requireSha to applyResolveOptions", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData() });
    await runResolveMutate({
      ...BASE_OPTS,
      resolveThreadIds: ["t-1"],
      minimizeCommentIds: ["c-1"],
      dismissReviewIds: ["r-1"],
      dismissMessage: "done",
      requireSha: "sha-abc",
    });
    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({
        resolveThreadIds: ["t-1"],
        minimizeCommentIds: ["c-1"],
        dismissReviewIds: ["r-1"],
        dismissMessage: "done",
        requireSha: "sha-abc",
      }),
    );
  });
});
