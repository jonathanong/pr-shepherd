import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeThread,
  mockFetchPrBatch,
  mockLoadSeenMap,
  mockMarkSeen,
} from "./resolve.test-support.mts";
import { hashBody } from "../state/seen-comments.mts";
import { runResolveFetch } from "./resolve.mts";

registerHooks();

describe("runResolveFetch — active thread markers", () => {
  it("surfaces unseen active thread and marks it seen", async () => {
    const active = makeThread({ id: "t-active", body: "active feedback" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [active] }) });
    mockLoadSeenMap.mockResolvedValue(new Map());

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.actionableThreads.map((t) => t.id)).toEqual(["t-active"]);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), "t-active", "active feedback");
  });

  it("suppresses unchanged active thread after first look", async () => {
    const active = makeThread({ id: "t-active", body: "active feedback" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [active] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-active", { seenAt: 1000, bodyHash: hashBody("active feedback") }]]),
    );

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.actionableThreads).toEqual([]);
  });

  it("re-surfaces edited active thread", async () => {
    const active = makeThread({ id: "t-active", body: "updated active feedback" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [active] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-active", { seenAt: 1000, bodyHash: hashBody("old active feedback") }]]),
    );

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.actionableThreads).toMatchObject([{ id: "t-active", edited: true }]);
    expect(mockMarkSeen).toHaveBeenCalledWith(
      expect.any(Object),
      "t-active",
      "updated active feedback",
    );
  });
});
