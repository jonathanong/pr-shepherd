import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  mockFetchPrBatch,
  mockMarkSeen,
  makeThread,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — unreadable nodes", () => {
  it("is not READY when a review thread came back null, and writes no marker for it", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData() });
    const complete = await runCheck(BASE_OPTS);
    expect(complete.status).toBe("READY");

    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ unreadNodes: { feedback: true } }),
    });
    const withheld = await runCheck(BASE_OPTS);

    expect(withheld.status).toBe("PENDING");
    expect(withheld.threads.firstLook).toEqual([]);
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it("still surfaces and marks the threads it did read", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [makeThread({ id: "t-read", body: "needs a fix" })],
        unreadNodes: { feedback: true },
      }),
    });

    const report = await runCheck(BASE_OPTS);

    expect(report.status).not.toBe("READY");
    expect(report.threads.actionable.map((t) => t.id)).toEqual(["t-read"]);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), "t-read", expect.any(String));
  });
});
