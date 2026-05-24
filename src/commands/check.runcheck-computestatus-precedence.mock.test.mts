import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeCheck,
  mockLoadSeenMap,
  mockFetchPrBatch,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

function hashBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex").slice(0, 16);
}

describe("runCheck — computeStatus precedence", () => {
  it("returns FAILING when mergeStateStatus=DIRTY (CONFLICTS)", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ mergeStateStatus: "DIRTY" }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("FAILING");
  });

  it("returns FAILING when anyFailing", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ checks: [makeCheck({ category: "failing", conclusion: "FAILURE" })] }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("FAILING");
  });

  it("returns IN_PROGRESS before BLOCKED", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        mergeStateStatus: "BLOCKED",
        checks: [makeCheck({ category: "in_progress", status: "IN_PROGRESS", conclusion: null })],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("IN_PROGRESS");
  });

  it("returns READY when CI passed and merge is clean", async () => {
    const report = await runCheck(BASE_OPTS);
    expect(report.status).toBe("READY");
  });

  it("keeps status unresolved when an unchanged CHANGES_REQUESTED review is marker-suppressed", async () => {
    mockLoadSeenMap.mockResolvedValue(
      new Map([["r-human", { seenAt: 1000, bodyHash: hashBody("changes requested") }]]),
    );
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        changesRequestedReviews: [
          { id: "r-human", author: "alice", authorType: "User", body: "changes requested" },
        ],
      }),
    });

    const report = await runCheck(BASE_OPTS);

    expect(report.status).toBe("UNRESOLVED_COMMENTS");
    expect(report.changesRequestedReviews).toEqual([]);
  });
});
