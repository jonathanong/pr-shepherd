import { describe, expect, it } from "vitest";
import {
  makeIterateResult,
  projectIterateLean,
} from "../../test-helpers/cli/iterate-lean.test-support.mts";

describe("projectIterateLean — author provenance", () => {
  it("preserves per-reply author provenance in lean JSON", () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.threads = [
      {
        id: "thread-1",
        path: "src/x.ts",
        line: 1,
        author: "review-bot[bot]",
        authorType: "Bot",
        authorAssociation: "NONE",
        body: "automated review",
        url: "",
        comments: [
          {
            id: "comment-1",
            author: "review-bot[bot]",
            authorType: "Bot",
            authorAssociation: "NONE",
            body: "automated review",
            url: "",
          },
          {
            id: "comment-2",
            author: "maintainer",
            authorType: "User",
            authorAssociation: "OWNER",
            body: "maintainer reply",
            url: "",
          },
          {
            id: "comment-3",
            author: "drive-by",
            authorType: "User",
            authorAssociation: "NONE",
            body: "outsider reply",
            url: "",
          },
        ],
      },
    ];

    const lean = projectIterateLean(result) as Record<string, unknown>;
    const fix = lean.fix as Record<string, unknown>;
    const threads = fix.threads as typeof result.fix.threads;

    expect(threads[0]).toMatchObject({
      author: "review-bot[bot]",
      authorType: "Bot",
      authorAssociation: "NONE",
      comments: [
        { author: "review-bot[bot]", authorType: "Bot", authorAssociation: "NONE" },
        { author: "maintainer", authorType: "User", authorAssociation: "OWNER" },
        { author: "drive-by", authorType: "User", authorAssociation: "NONE" },
      ],
    });
  });
});
