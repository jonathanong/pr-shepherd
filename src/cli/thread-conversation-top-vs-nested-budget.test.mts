import { describe, expect, it } from "vitest";
import { renderThreadConversation } from "./list-formatters.mts";

// A body longer than the 600-char nested budget but shorter than the 1,200-char
// top-level budget — it must survive uncapped only when it is comments[0].
const MID_LENGTH_BODY = Array.from({ length: 35 }, (_, i) => `line ${i} of the review`).join("\n");

describe("renderThreadConversation — top-level vs nested body budget", () => {
  it("gives the top-level budget to the first transcript entry even when replies follow", () => {
    const out = renderThreadConversation({
      id: "t1",
      author: "reviewer",
      body: "original comment",
      comments: [
        { id: "c0", author: "reviewer", body: MID_LENGTH_BODY, url: "" },
        { id: "c1", author: "author", body: "short reply", url: "" },
      ],
    });

    expect(out).not.toContain("chars elided");
    expect(out).toContain("line 0 of the review");
    expect(out).toContain("line 34 of the review");
  });

  it("still caps the same length body when it is a nested reply, not the first entry", () => {
    const out = renderThreadConversation({
      id: "t1",
      author: "reviewer",
      body: "original comment",
      comments: [
        { id: "c0", author: "reviewer", body: "short original", url: "" },
        { id: "c1", author: "author", body: MID_LENGTH_BODY, url: "" },
      ],
    });

    expect(out).toContain("chars elided");
  });
});
