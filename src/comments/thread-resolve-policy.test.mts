import { describe, expect, it } from "vitest";
import type { ReviewThread } from "../types.mts";
import { shouldResolveOtherHumanThread } from "./thread-resolve-policy.mts";

function thread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: "t1",
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
    path: "src/foo.mts",
    line: 10,
    startLine: null,
    author: "reviewer",
    authorType: "User",
    body: "please fix",
    url: "",
    createdAtUnix: 1,
    viewerCanReply: true,
    viewerCanResolve: true,
    ...overrides,
  };
}

describe("shouldResolveOtherHumanThread", () => {
  it("is false for none", () => {
    expect(shouldResolveOtherHumanThread(thread(), "none")).toBe(false);
    expect(shouldResolveOtherHumanThread(thread({ isOutdated: true }), "none")).toBe(false);
  });

  it("is true for outdated only when the thread is outdated", () => {
    expect(shouldResolveOtherHumanThread(thread(), "outdated")).toBe(false);
    expect(shouldResolveOtherHumanThread(thread({ isOutdated: true }), "outdated")).toBe(true);
  });

  it("is true for always regardless of outdated", () => {
    expect(shouldResolveOtherHumanThread(thread(), "always")).toBe(true);
    expect(shouldResolveOtherHumanThread(thread({ isOutdated: true }), "always")).toBe(true);
  });
});
