import { describe, expect, it } from "vitest";
import { parseRawPr } from "./batch-parsers.mts";
import { makeRawPr } from "../../test-helpers/github/batch-fixtures.mts";
import type { RawPr, RawThread } from "./batch-raw-types.mts";

describe("parseRawPr viewer authorship", () => {
  it("keeps true markers and omits false markers on threads and comments", () => {
    const raw = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "t-viewer",
            isResolved: false,
            isOutdated: false,
            comments: {
              nodes: [
                {
                  id: "c-viewer",
                  isMinimized: false,
                  viewerDidAuthor: true,
                  author: { __typename: "User", login: "alice" },
                  body: "viewer authored",
                  url: "",
                  path: "src/foo.ts",
                  line: 1,
                  startLine: null,
                },
                {
                  id: "c-other",
                  isMinimized: false,
                  viewerDidAuthor: false,
                  author: { __typename: "User", login: "bob" },
                  body: "other authored",
                  url: "",
                  path: "src/foo.ts",
                  line: 1,
                  startLine: null,
                },
              ],
            },
          },
        ],
      },
    });

    const data = parseRawPr(
      raw as unknown as RawPr,
      raw.reviewThreads.nodes as unknown as RawThread[],
      [],
      [],
      [],
      [],
      [],
    );
    const thread = data.reviewThreads[0]!;

    expect(thread.viewerDidAuthor).toBe(true);
    expect(thread.comments?.[0]?.viewerDidAuthor).toBe(true);
    expect(thread.comments?.[1]).not.toHaveProperty("viewerDidAuthor");
  });
});
