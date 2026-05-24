import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  mockFetchPrBatch,
  mockLoadSeenMap,
  mockMarkSeen,
} from "../../test-helpers/commands/resolve.test-support.mts";
import { hashBody } from "../state/seen-comments.mts";
import { runResolveFetch } from "./resolve.mts";

registerHooks();

describe("runResolveFetch — review markers", () => {
  it("suppresses unchanged reviewSummaries and re-surfaces edited ones", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewSummaries: [
          { id: "PRR_SEEN", author: "alice", authorType: "User", body: "same" },
          { id: "PRR_EDITED", author: "alice", authorType: "User", body: "new" },
        ],
      }),
    });
    mockLoadSeenMap.mockResolvedValue(
      new Map([
        ["PRR_SEEN", { seenAt: 1000, bodyHash: hashBody("same") }],
        ["PRR_EDITED", { seenAt: 1000, bodyHash: hashBody("old") }],
      ]),
    );

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.reviewSummaries).toEqual([
      { id: "PRR_EDITED", author: "alice", authorType: "User", body: "new", edited: true },
    ]);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), "PRR_EDITED", "new");
    expect(mockMarkSeen).not.toHaveBeenCalledWith(expect.any(Object), "PRR_SEEN", "same");
  });

  it("suppresses unchanged changes-requested reviews and marks new ones", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        changesRequestedReviews: [
          { id: "PRR_SEEN", author: "alice", authorType: "User", body: "same" },
          { id: "PRR_NEW", author: "bob", authorType: "User", body: "review body" },
        ],
      }),
    });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["PRR_SEEN", { seenAt: 1000, bodyHash: hashBody("same") }]]),
    );

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.changesRequestedReviews).toEqual([
      { id: "PRR_NEW", author: "bob", authorType: "User", body: "review body" },
    ]);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), "PRR_NEW", "review body");
  });
});
