import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  mockAutoResolveOutdated,
  mockFetchPrBatch,
  mockLoadSeenMap,
  mockMarkSeen,
  makeThread,
} from "../../test-helpers/commands/check.test-support.mts";
import { hashBody } from "../state/seen-comments.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — first-look items", () => {
  it("surfaces unseen outdated thread in threads.firstLook", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(1);
    expect(report.threads.firstLook[0]?.id).toBe("t-outdated");
    expect(report.threads.firstLook[0]?.firstLookStatus).toBe("outdated");
    expect(report.threads.firstLook[0]?.autoResolved).toBeUndefined();
  });
  it("surfaces unseen active thread in threads.actionable and marks it seen", async () => {
    const active = makeThread({ id: "t-active", body: "active feedback" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [active] }) });

    const report = await runCheck(BASE_OPTS);

    expect(report.threads.actionable.map((t) => t.id)).toEqual(["t-active"]);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), "t-active", "active feedback");
  });
  it("suppresses already-seen active thread with unchanged body", async () => {
    const active = makeThread({ id: "t-active", body: "active feedback" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [active] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-active", { seenAt: 1000, bodyHash: hashBody("active feedback") }]]),
    );

    const report = await runCheck(BASE_OPTS);

    expect(report.threads.actionable).toEqual([]);
  });
  it("re-surfaces edited active thread and updates the marker", async () => {
    const active = makeThread({ id: "t-active", body: "updated active feedback" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [active] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-active", { seenAt: 1000, bodyHash: hashBody("old active feedback") }]]),
    );

    const report = await runCheck(BASE_OPTS);

    expect(report.threads.actionable).toMatchObject([{ id: "t-active", edited: true }]);
    expect(mockMarkSeen).toHaveBeenCalledWith(
      expect.any(Object),
      "t-active",
      "updated active feedback",
    );
  });
  it("does not auto-resolve outdated threads during check", async () => {
    const outdated = makeThread({ id: "t-auto", isOutdated: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    mockAutoResolveOutdated.mockResolvedValue({ resolved: ["t-auto"], errors: [] });
    const report = await runCheck({ ...BASE_OPTS, autoResolve: true });
    expect(mockAutoResolveOutdated).not.toHaveBeenCalled();
    expect(report.threads.firstLook[0]?.autoResolved).toBeUndefined();
    expect(report.threads.resolutionOnly.map((t) => t.id)).toEqual(["t-auto"]);
  });
  it("surfaces unseen resolved thread in threads.firstLook", async () => {
    const resolved = makeThread({ id: "t-resolved", isResolved: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [resolved] }) });
    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(1);
    expect(report.threads.firstLook[0]?.firstLookStatus).toBe("resolved");
  });
  it("surfaces unseen minimized thread in threads.firstLook", async () => {
    const minimized = makeThread({ id: "t-minimized", isMinimized: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [minimized] }) });
    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(1);
    expect(report.threads.firstLook[0]?.firstLookStatus).toBe("minimized");
  });
  it("suppresses already-seen items (unchanged hash)", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true, body: "fix this" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-outdated", { seenAt: 1000, bodyHash: hashBody("fix this") }]]),
    );

    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(0);
    expect(report.threads.resolutionOnly.map((t) => t.id)).toEqual(["t-outdated"]);
  });
  it("suppresses already-seen items (legacy marker without hash)", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    mockLoadSeenMap.mockResolvedValue(new Map([["t-outdated", { seenAt: 1000 }]]));

    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(0);
  });
  it("re-surfaces edited item with edited: true", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true, body: "new body" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    // Stored hash does NOT match current body → classified as "edited"
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-outdated", { seenAt: 1000, bodyHash: hashBody("old body") }]]),
    );

    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(1);
    expect(report.threads.firstLook[0]?.edited).toBe(true);
    expect(report.threads.firstLook[0]?.firstLookStatus).toBe("outdated");
  });
});
