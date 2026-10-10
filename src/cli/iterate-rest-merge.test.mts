import { describe, expect, it } from "vitest";
import type { IterateResult } from "../types.mts";
import { formatIterateResult } from "./iterate-formatter.mts";
import { projectIterateLean } from "./iterate-lean.mts";

describe("REST merge output", () => {
  it("prints and projects the SHA-pinned asynchronous merge contract", () => {
    const result = {
      action: "merge",
      pr: 42,
      repo: "owner/repo",
      transport: "rest",
      transportUnavailable: [{ field: "reviewDecision", reason: "REST does not expose it" }],
      status: "READY",
      state: "OPEN",
      mergeStateStatus: "CLEAN",
      mergeStatus: "CLEAN",
      reviewDecision: null,
      blockingBotReviewInProgress: false,
      isDraft: false,
      shouldCancel: true,
      remainingSeconds: 0,
      summary: { passing: 1, skipped: 0, filtered: 0, inProgress: 0, superseded: 0 },
      baseBranch: "main",
      branchProtection: null,
      checks: [],
      merge: {
        mode: "rest",
        command: {
          argv: [
            "pr-shepherd",
            "apply",
            "merge",
            "https://github.com/owner/repo/pull/42",
            "--require-sha",
            "a".repeat(40),
            "--merge-action",
            "direct_merge",
            "--method",
            "squash",
            "--transport",
            "rest",
          ],
        },
      },
    } as IterateResult;

    const output = formatIterateResult(result);
    expect(output).toContain("**transport** `rest`");
    expect(output).toContain("## Unavailable transport fields");
    expect(output).toContain("pr-shepherd apply merge https://github.com/owner/repo/pull/42");
    expect(output).toContain("--require-sha");
    expect(output).toContain("--merge-action direct_merge");
    expect(output).toContain("If its status is `pending`, rerun that same command");
    expect(output).toContain("`enqueued` is not merged");
    expect(output).not.toContain("gh pr merge");
    expect(projectIterateLean(result)).toMatchObject({
      transport: "rest",
      transportUnavailable: [{ field: "reviewDecision" }],
      merge: { mode: "rest" },
    });
  });
});
