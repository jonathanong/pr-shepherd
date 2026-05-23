import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeThread,
  mockAutoResolveOutdated,
  mockFetchPrBatch,
} from "./resolve.test-support.mts";
import { runResolveFetch } from "./resolve.mts";

registerHooks();

describe("runResolveFetch — outdated threads", () => {
  it("does not auto-resolve outdated threads", async () => {
    const outdated = makeThread({ id: "outdated-1", isOutdated: true, isResolved: false });
    const resolved = makeThread({ id: "resolved-1", isOutdated: true, isResolved: true });
    const active = makeThread({ id: "active-1", isOutdated: false });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [outdated, resolved, active] }),
    });
    mockAutoResolveOutdated.mockResolvedValue({ resolved: ["outdated-1"], errors: [] });

    await runResolveFetch(BASE_OPTS);
    expect(mockAutoResolveOutdated).not.toHaveBeenCalled();
  });
  it("continues without logging auto-resolve errors", async () => {
    const outdated = makeThread({ id: "outdated-1", isOutdated: true, isResolved: false });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    mockAutoResolveOutdated.mockResolvedValue({ resolved: [], errors: ["rate limit hit"] });

    const result = await runResolveFetch(BASE_OPTS);

    expect(mockAutoResolveOutdated).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });
  it("activeThreads excludes outdated threads", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true });
    const active = makeThread({ id: "t-active", isOutdated: false });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [outdated, active] }),
    });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.actionableThreads.map((t) => t.id)).toEqual(["t-active"]);
    expect(result.resolutionOnlyThreads.map((t) => t.id)).toEqual(["t-outdated"]);
  });
  it("routes minimized unresolved threads to resolutionOnlyThreads", async () => {
    const minimized = makeThread({ id: "t-minimized", isMinimized: true });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [minimized] }),
    });

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.actionableThreads).toHaveLength(0);
    expect(result.resolutionOnlyThreads.map((t) => t.id)).toEqual(["t-minimized"]);
  });
  it("attaches a parsed suggestion block to threads whose body contains one", async () => {
    const thread = makeThread({
      id: "t-with-suggestion",
      path: "src/foo.ts",
      line: 10,
      startLine: null,
      author: "reviewer",
      authorType: "Unknown" as const,
      body: "Consider this change:\n\n```suggestion\nconst x = 42;\n```",
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.actionableThreads[0]?.suggestion).toEqual({
      startLine: 10,
      endLine: 10,
      lines: ["const x = 42;"],
      author: "reviewer",
    });
  });
  it("uses thread.startLine for multi-line suggestion ranges", async () => {
    const thread = makeThread({
      id: "t-multi",
      path: "src/foo.ts",
      line: 12,
      startLine: 10,
      body: "```suggestion\nA\nB\nC\n```",
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.actionableThreads[0]?.suggestion).toMatchObject({
      startLine: 10,
      endLine: 12,
      lines: ["A", "B", "C"],
    });
  });
  it('losslessly distinguishes deletion (lines: []) from blank-line replacement (lines: [""])', async () => {
    const deletion = makeThread({
      id: "t-del",
      path: "a.ts",
      line: 3,
      body: "```suggestion\n```",
    });
    const blank = makeThread({
      id: "t-blank",
      path: "b.ts",
      line: 3,
      body: "```suggestion\n\n```",
    });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [deletion, blank] }),
    });
    const result = await runResolveFetch(BASE_OPTS);
    const byId = Object.fromEntries(result.actionableThreads.map((t) => [t.id, t]));
    expect(byId["t-del"]!.suggestion?.lines).toEqual([]);
    expect(byId["t-blank"]!.suggestion?.lines).toEqual([""]);
  });
  it("omits suggestion for threads without a ```suggestion block", async () => {
    const thread = makeThread({
      id: "t-plain",
      path: "src/foo.ts",
      line: 5,
      body: "please rename this variable",
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.actionableThreads[0]?.suggestion).toBeUndefined();
  });
  it("omits suggestion for threads with no file/line anchor even when body has a suggestion block", async () => {
    const thread = makeThread({
      id: "t-no-anchor",
      path: null,
      line: null,
      body: "```suggestion\nconst x = 10;\n```",
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.actionableThreads[0]?.suggestion).toBeUndefined();
  });
  it("surfaces commitSuggestionsEnabled mirroring the config flag", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({}) });
    const result = await runResolveFetch(BASE_OPTS);
    expect(result.commitSuggestionsEnabled).toBe(true);
  });
});
