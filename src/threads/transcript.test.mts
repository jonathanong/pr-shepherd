import { describe, expect, it } from "vitest";
import { threadComments, threadTranscriptBody } from "./transcript.mts";
import type { ReviewThread } from "../types.mts";

describe("thread transcript helpers", () => {
  it("builds a fallback single-comment transcript for legacy thread shapes", () => {
    const comments = threadComments({
      author: "alice",
      body: "legacy body",
      url: undefined,
    });

    expect(comments).toEqual([
      {
        id: "",
        isMinimized: false,
        author: "alice",
        authorType: "Unknown",
        body: "legacy body",
        url: "",
        createdAtUnix: 0,
      },
    ]);
  });

  it("keeps legacy body hashing when no comments array is present", () => {
    const thread = {
      body: "legacy body",
    } as ReviewThread;

    expect(threadTranscriptBody(thread)).toBe("legacy body");
  });

  it("hashes transcript bodies without GitHub comment IDs", () => {
    const thread = {
      body: "top body",
      comments: [
        { id: "comment-1", author: "alice", body: "top body", url: "" },
        { id: "comment-2", author: "bob", body: "reply body", url: "" },
      ],
    } as ReviewThread;

    expect(threadTranscriptBody(thread, ["agent reply"])).toBe(
      ["top body", "reply body", "agent reply"].join("\n\n--- thread comment ---\n\n"),
    );
  });
});
