import { describe, expect, it } from "vitest";
import { formatMarkFilesAsViewedResult } from "./mark-files-as-viewed-formatter.mts";
import type { MarkFilesAsViewedResult } from "../commands/mark-files-as-viewed.mts";

describe("formatMarkFilesAsViewedResult", () => {
  it("renders all populated sections and filters rate-limit errors", () => {
    const out = formatMarkFilesAsViewedResult({
      ...baseResult(),
      matchedPaths: ["src/a.ts", "tests/a.test.ts"],
      markedPaths: ["src/a.ts"],
      alreadyViewedPaths: ["tests/a.test.ts"],
      missingPaths: ["src/missing.ts"],
      unmatchedSelectors: ["--match docs"],
      errors: ["rate limit: API rate limit exceeded", "src/b.ts: mark returned null"],
      rateLimit: {
        message: "API rate limit exceeded",
        retryAfterSeconds: 60,
        remaining: 0,
        limit: 5000,
        resetAt: 1700000000,
      },
      unmarkedPaths: ["src/b.ts"],
    });

    expect(out).toContain("# PR #42 — Mark files as viewed (1 marked)");
    expect(out).toContain("## Matched files (2)");
    expect(out).toContain("## Marked viewed (1)");
    expect(out).toContain("## Already viewed (1)");
    expect(out).toContain("## Missing from PR diff (1)");
    expect(out).toContain("## Unmatched selectors (1)");
    expect(out).toContain("Stopped: GitHub rate limit hit");
    expect(out).toContain("retry after 60s");
    expect(out).toContain("remaining 0/5000");
    expect(out).toContain("reset at 2023-11-14T22:13:20.000Z");
    expect(out).toContain("## Not marked due to rate limit (1)");
    expect(out).toContain("## Errors (1)");
    expect(out).toContain("src/b.ts: mark returned null");
    expect(out).not.toContain("rate limit: API rate limit exceeded");
  });

  it("renders a no-match message and non-rate-limit errors", () => {
    const out = formatMarkFilesAsViewedResult({
      ...baseResult(),
      errors: ["src/a.ts: server unavailable"],
    });

    expect(out).toContain("No files matched.");
    expect(out).toContain("## Errors (1)");
    expect(out).toContain("src/a.ts: server unavailable");
  });
});

function baseResult(): MarkFilesAsViewedResult {
  return {
    repo: "owner/repo",
    prNumber: 42,
    pullRequestId: "PR_1",
    requestedPaths: [],
    testSelector: false,
    matchPatterns: [],
    matchedPaths: [],
    markedPaths: [],
    alreadyViewedPaths: [],
    missingPaths: [],
    unmatchedSelectors: [],
    errors: [],
  };
}
