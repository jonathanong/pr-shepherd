import { describe, it, expect } from "vitest";
import { registerHooks, REPO, mockGraphql } from "./resolve.test-support.mts";
import { applyResolveOptions } from "./resolve.mts";

registerHooks();

describe("applyResolveOptions — validation", () => {
  it("throws synchronously when dismissing without --message", async () => {
    await expect(applyResolveOptions(1, REPO, { dismissReviewIds: ["r-1"] })).rejects.toThrow(
      "--message is required",
    );
  });

  it("throws when replying without --message", async () => {
    await expect(applyResolveOptions(1, REPO, { replyThreadIds: ["t-1"] })).rejects.toThrow(
      "--message is required",
    );
  });

  it("does nothing when no mutation IDs are provided", async () => {
    const result = await applyResolveOptions(1, REPO, {});
    expect(result).toEqual({
      repliedThreads: [],
      resolvedThreads: [],
      minimizedComments: [],
      dismissedReviews: [],
      errors: [],
    });
    expect(result).not.toHaveProperty("skippedDismissals");
    expect(mockGraphql).not.toHaveBeenCalled();
  });
});
