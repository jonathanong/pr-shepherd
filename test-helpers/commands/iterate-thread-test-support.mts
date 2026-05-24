import type { ReviewThread } from "../../src/types.mts";
import { NOW } from "./iterate-test-support.mts";

export function makeThread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: "thread-1",
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
    path: "src/foo.mts",
    line: 10,
    startLine: null,
    author: "reviewer",
    authorType: "Unknown",
    body: "Fix this",
    url: "",
    createdAtUnix: NOW - 3600,
    ...overrides,
  };
}
