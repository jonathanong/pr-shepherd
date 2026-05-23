import { describe, expect, it } from "vitest";
import { classifyThreadVisibility } from "./thread-visibility.mts";
import type { ReviewThread } from "../types.mts";

function makeThread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: "thread-1",
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
    path: "src/foo.mts",
    line: 10,
    startLine: null,
    author: "reviewer",
    authorType: "User",
    body: "body",
    url: "",
    createdAtUnix: 1,
    ...overrides,
  };
}

describe("classifyThreadVisibility", () => {
  it("dedupes toMarkSeen while preserving first surfaced order", () => {
    const active = makeThread({ id: "active" });
    const outdated = makeThread({ id: "outdated", isOutdated: true });
    const duplicateOutdated = makeThread({ id: "outdated", isOutdated: true });

    const result = classifyThreadVisibility([active, outdated, duplicateOutdated], new Map());

    expect(result.toMarkSeen.map((t) => t.id)).toEqual(["active", "outdated"]);
  });
});
