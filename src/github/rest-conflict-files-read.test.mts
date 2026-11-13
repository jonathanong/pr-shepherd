import { describe, expect, it } from "vitest";
import { serve, wire, prefix, repo } from "../../test-helpers/github/rest-read.test-support.mts";
import { readRestFilesChangedOnBothSides } from "./rest-conflict-files-read.mts";

const mergeBase = "m".repeat(40);
const headPath = `${prefix}/compare/feature%2Fbase...abc123?per_page=100`;
const basePath = `${prefix}/compare/${mergeBase}...feature%2Fbase?per_page=100`;

describe("readRestFilesChangedOnBothSides", () => {
  it("intersects both sides through renames and pages the base side", async () => {
    await serve((request, response) => {
      if (request.path === headPath) {
        response.end(
          JSON.stringify({
            merge_base_commit: { sha: mergeBase },
            files: [
              { filename: "a.ts" },
              { filename: "only-head.ts" },
              { filename: "new.ts", previous_filename: "old.ts" },
              { filename: "moved/c.ts", previous_filename: "c.ts" },
            ],
          }),
        );
      } else if (request.path === basePath) {
        response.setHeader(
          "link",
          `<https://api.github.com${prefix}/compare/${mergeBase}...feature%2Fbase?per_page=100&page=2>; rel="next"`,
        );
        response.end(JSON.stringify({ files: [{ filename: "a.ts" }, { filename: "old.ts" }] }));
      } else {
        response.end(JSON.stringify({ files: [{ filename: "c.ts" }] }));
      }
    });
    await expect(readRestFilesChangedOnBothSides(repo, "feature/base", "abc123")).resolves.toEqual([
      "a.ts",
      "new.ts",
      "moved/c.ts",
    ]);
  });

  it("rejects a comparison without a merge base", async () => {
    await serve((_request, response) => response.end(JSON.stringify({ files: [] })));
    await expect(readRestFilesChangedOnBothSides(repo, "feature/base", "abc123")).rejects.toThrow(
      "compare merge base",
    );
    expect(wire.requests).toHaveLength(1);
  });

  it("rejects a compare file without a name", async () => {
    await serve((_request, response) =>
      response.end(JSON.stringify({ merge_base_commit: { sha: mergeBase }, files: [{}] })),
    );
    await expect(readRestFilesChangedOnBothSides(repo, "feature/base", "abc123")).rejects.toThrow(
      "compare file name",
    );
  });
});
