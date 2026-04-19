import { describe, it, expect } from "vitest";
import { getOutdatedThreads } from "./outdated.mts";
import type { ReviewThread } from "../types.mts";

function makeThread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: "thread-1",
    isResolved: false,
    isOutdated: false,
    path: "src/foo.ts",
    line: 10,
    author: "alice",
    body: "please fix",
    createdAtUnix: 1_700_000_000,
    ...overrides,
  };
}

describe("getOutdatedThreads", () => {
  it("returns empty array for empty input", () => {
    expect(getOutdatedThreads([])).toEqual([]);
  });

  it("returns empty when all threads are resolved", () => {
    const threads = [
      makeThread({ id: "a", isOutdated: true, isResolved: true }),
      makeThread({ id: "b", isOutdated: true, isResolved: true }),
    ];
    expect(getOutdatedThreads(threads)).toEqual([]);
  });

  it("returns empty when no threads are outdated", () => {
    const threads = [
      makeThread({ id: "a", isOutdated: false, isResolved: false }),
      makeThread({ id: "b", isOutdated: false, isResolved: false }),
    ];
    expect(getOutdatedThreads(threads)).toEqual([]);
  });

  it("returns only outdated+unresolved threads", () => {
    const eligible = makeThread({ id: "outdated-unresolved", isOutdated: true, isResolved: false });
    const threads = [
      eligible,
      makeThread({ id: "outdated-resolved", isOutdated: true, isResolved: true }),
      makeThread({ id: "active", isOutdated: false, isResolved: false }),
    ];
    expect(getOutdatedThreads(threads)).toEqual([eligible]);
  });

  it("returns multiple outdated+unresolved threads", () => {
    const a = makeThread({ id: "a", isOutdated: true, isResolved: false });
    const b = makeThread({ id: "b", isOutdated: true, isResolved: false });
    expect(getOutdatedThreads([a, b])).toEqual([a, b]);
  });
});
