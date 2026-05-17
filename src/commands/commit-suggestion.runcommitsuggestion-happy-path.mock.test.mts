// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  GLOBAL_OPTS,
  makeBatch,
  makeThread,
  mockExecFile,
  mockFetchBatch,
  mockGetCurrentBranch,
  mockLoadConfig,
  setupHappyPath,
} from "./commit-suggestion.test-support.mts";
import { runCommitSuggestion } from "./commit-suggestion.mts";

registerHooks();

describe("runCommitSuggestion — happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    setupHappyPath();
  });

  it("returns patch, commitMessage, commitBody, filesToStage, postActionInstructions", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "apply suggestion",
    });
    expect(result.patch).toContain("--- a/src/foo.ts");
    expect(result.patch).toContain("+const x = 10;");
    expect(result.commitMessage).toBe("apply suggestion");
    expect(result.commitBody).toContain("Co-authored-by: alice <alice@users.noreply.github.com>");
    expect(result.filesToStage).toEqual(["src/foo.ts"]);
    expect(result.postActionInstructions).toHaveLength(5);
    expect(result.threadId).toBe("PRRT_x");
    expect(result.author).toBe("alice");
    expect(result.path).toBe("src/foo.ts");
    expect(result.pr).toBe(42);
    expect(result.repo).toBe("owner/repo");
  });

  it("never calls git apply, git add, or git commit", async () => {
    await runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" });

    const mutatingCalls = mockExecFile.mock.calls.filter(
      (call) =>
        call[0] === "git" &&
        ["apply", "add", "commit", "checkout"].includes((call[1] as string[])[0] ?? ""),
    );
    expect(mutatingCalls).toHaveLength(0);
  });

  it("prepends --description to commitBody before Co-authored-by", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "apply suggestion",
      description: "Reviewer asked to use const.",
    });
    expect(result.commitBody).toContain("Reviewer asked to use const.");
    expect(result.commitBody).toContain("Co-authored-by: alice");
    expect(result.commitBody.indexOf("Reviewer")).toBeLessThan(
      result.commitBody.indexOf("Co-authored-by"),
    );
  });

  it("postActionInstructions include git add, git commit, and pr-shepherd resolve steps", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    const joined = result.postActionInstructions.join("\n");
    expect(joined).toContain("git add");
    expect(joined).toContain("git commit");
    expect(joined).toContain("pr-shepherd resolve");
    expect(joined).toContain("git push");
  });

  it("multi-line range: uses startLine from thread", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([
        makeThread({
          line: 6,
          startLine: 4,
          body: "```suggestion\nreplacement1\nreplacement2\nreplacement3\n```",
        }),
      ]),
    });

    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    expect(result.startLine).toBe(4);
    expect(result.endLine).toBe(6);
  });
});
