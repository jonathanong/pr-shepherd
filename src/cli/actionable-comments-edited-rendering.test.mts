import { describe, expect, it } from "vitest";
import { formatFetchResult } from "./formatters.mts";
import { formatFixCodeResult } from "./fix-formatter.mts";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import type { FetchResult } from "../commands/resolve.mts";

describe("edited actionable comment rendering", () => {
  it("renders edited actionable comments in fix_code output", () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("expected fix_code fixture");
    result.fix = {
      ...result.fix,
      actionableComments: [
        {
          id: "c-edited",
          author: "alice",
          authorType: "User",
          body: "Updated note.",
          url: "",
          edited: true,
        },
      ],
      instructions: ["Items marked `[edited since first look]` were updated by their author."],
    };

    const out = formatFixCodeResult("# PR #42 [FIX_CODE]", result);

    expect(out).toContain("### `commentId=c-edited` (@alice · User) [edited since first look]");
    expect(out).toContain("Items marked `[edited since first look]`");
  });

  it("renders edited actionable comments in resolve-fetch output", () => {
    const result: FetchResult = {
      prNumber: 42,
      actionableThreads: [],
      resolutionOnlyThreads: [],
      firstLookThreads: [],
      actionableComments: [
        {
          id: "c-edited",
          isMinimized: false,
          author: "alice",
          authorType: "User",
          body: "Updated note.",
          url: "",
          createdAtUnix: 0,
          edited: true,
        },
      ],
      firstLookComments: [],
      changesRequestedReviews: [],
      reviewSummaries: [],
      commitSuggestionsEnabled: false,
      instructions: [
        "Actionable comments marked `[edited since first look]` were updated by their author.",
      ],
    };

    const out = formatFetchResult(result);

    expect(out).toContain(
      "- `commentId=c-edited` (@alice · User) [edited since first look]: Updated note.",
    );
    expect(out).toContain("Actionable comments marked `[edited since first look]`");
  });
});
