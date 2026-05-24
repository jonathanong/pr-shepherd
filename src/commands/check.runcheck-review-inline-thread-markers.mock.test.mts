import { describe, expect, it } from "vitest";
import {
  BASE_OPTS,
  makeBatchData,
  makeThread,
  mockFetchPrBatch,
  mockMarkReviewInlineThreads,
  registerHooks,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — review inline-thread markers", () => {
  it("stores review-to-inline-thread marker metadata", async () => {
    const thread = makeThread({ id: "t-child", reviewId: "PRR_PARENT" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });

    await runCheck(BASE_OPTS);

    expect(mockMarkReviewInlineThreads).toHaveBeenCalledWith(expect.any(Object), "PRR_PARENT", [
      "t-child",
    ]);
  });
});
