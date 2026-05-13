// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  mockFetchPrBatch,
  mockLoadSeenMap,
  mockMarkSeen,
} from "./check.test-support.mts";
import { hashBody } from "../state/seen-comments.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — reviewSummaries + approvedReviews pass-through", () => {
  it("surfaces an unseen summary in firstLookSummaries (not reviewSummaries) and marks it seen", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewSummaries: [
          { id: "PRR_SUM", author: "copilot", authorType: "Unknown" as const, body: "overview" },
        ],
        approvedReviews: [
          { id: "PRR_AP", author: "alice", authorType: "Unknown" as const, body: "" },
        ],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.firstLookSummaries).toEqual([
      { id: "PRR_SUM", author: "copilot", authorType: "Unknown" as const, body: "overview" },
    ]);
    expect(report.reviewSummaries).toEqual([]);
    expect(report.approvedReviews).toEqual([
      { id: "PRR_AP", author: "alice", authorType: "Unknown" as const, body: "" },
    ]);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.anything(), "PRR_SUM", "overview");
  });

  it("surfaces an already-seen summary in reviewSummaries (not firstLookSummaries)", async () => {
    mockLoadSeenMap.mockResolvedValue(
      new Map([["PRR_SUM", { seenAt: 1000, bodyHash: hashBody("overview") }]]),
    );
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewSummaries: [
          { id: "PRR_SUM", author: "copilot", authorType: "Unknown" as const, body: "overview" },
        ],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.reviewSummaries).toEqual([
      { id: "PRR_SUM", author: "copilot", authorType: "Unknown" as const, body: "overview" },
    ]);
    expect(report.firstLookSummaries).toEqual([]);
    expect(mockMarkSeen).not.toHaveBeenCalledWith(expect.anything(), "PRR_SUM", expect.anything());
  });

  it("re-surfaces edited summaries separately and marks the updated body seen", async () => {
    mockLoadSeenMap.mockResolvedValue(
      new Map([["PRR_SUM", { seenAt: 1000, bodyHash: hashBody("old overview") }]]),
    );
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewSummaries: [
          {
            id: "PRR_SUM",
            author: "copilot",
            authorType: "Unknown" as const,
            body: "new overview",
          },
        ],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.editedSummaries).toEqual([
      {
        id: "PRR_SUM",
        author: "copilot",
        authorType: "Unknown" as const,
        body: "new overview",
      },
    ]);
    expect(report.firstLookSummaries).toEqual([]);
    expect(report.reviewSummaries).toEqual([]);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.anything(), "PRR_SUM", "new overview");
  });

  it("defaults to empty arrays when batch has none", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData() });
    const report = await runCheck(BASE_OPTS);
    expect(report.reviewSummaries).toEqual([]);
    expect(report.firstLookSummaries).toEqual([]);
    expect(report.approvedReviews).toEqual([]);
  });
});
