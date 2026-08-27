import { describe, expect, it } from "vitest";

import type { BuildSuggestionPatchesResult } from "../types.mts";
import { formatSuggestionPatchesResult } from "./formatters.mts";

const RESULT: BuildSuggestionPatchesResult = {
  pr: 42,
  repo: "owner/repo",
  patches: [
    {
      threadId: "PRRT_one",
      path: "src/example.mts",
      startLine: 4,
      endLine: 5,
      author: "reviewer",
      patch: "--- a/src/example.mts\n+++ b/src/example.mts\n@@ -4,2 +4,2 @@\n-old\n+new\n",
      commitMessage: "Apply suggestion",
      commitBody: "Co-authored-by: reviewer <reviewer@users.noreply.github.com>",
      filesToStage: ["src/example.mts"],
    },
  ],
  postActionInstructions: ["Apply the patch.", "Push once."],
};

describe("formatSuggestionPatchesResult", () => {
  it("renders patch, commit metadata, and ordered instructions", () => {
    const output = formatSuggestionPatchesResult(RESULT);
    expect(output).toContain("## Patch 1\n\nSuggestion from @reviewer");
    expect(output).toContain("src/example.mts (lines 4–5)");
    expect(output).toContain("```diff\n--- a/src/example.mts");
    expect(output).toContain("## Instructions\n\n1. Apply the patch.\n2. Push once.");
  });

  it("omits empty patch and instruction sections", () => {
    const output = formatSuggestionPatchesResult({
      ...RESULT,
      patches: [{ ...RESULT.patches[0]!, startLine: 4, endLine: 4, patch: "" }],
      postActionInstructions: [],
    });
    expect(output).toContain("src/example.mts (line 4)");
    expect(output).not.toContain("```diff");
    expect(output).not.toContain("## Instructions");
  });
});
