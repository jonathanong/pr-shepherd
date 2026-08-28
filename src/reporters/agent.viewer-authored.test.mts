import { describe, expect, it } from "vitest";
import { toAgentThread } from "./agent.mts";
import type { ReviewThread } from "../types.mts";

describe("toAgentThread viewer authorship", () => {
  it("preserves viewer-authored markers on a thread and its replies", () => {
    const thread: ReviewThread = {
      id: "t-viewer",
      isResolved: false,
      isOutdated: false,
      isMinimized: false,
      path: "src/foo.ts",
      line: 1,
      startLine: null,
      author: "alice",
      authorType: "User",
      viewerDidAuthor: true,
      body: "Please fix this.",
      url: "",
      comments: [
        {
          id: "c-viewer",
          isMinimized: false,
          author: "alice",
          authorType: "User",
          viewerDidAuthor: true,
          body: "Please fix this.",
          url: "",
          createdAtUnix: 1,
        },
      ],
    };

    expect(toAgentThread(thread)).toMatchObject({
      viewerDidAuthor: true,
      comments: [{ viewerDidAuthor: true }],
    });
  });
});
