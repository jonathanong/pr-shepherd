// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  FILE_CONTENT,
  GLOBAL_OPTS,
  makeBatch,
  makeGitSuccess,
  makeThread,
  mockExecFile,
  mockFetchBatch,
  mockGetCurrentBranch,
  mockReadFile,
} from "./commit-suggestion.apply.test-support.mts";
import { runCommitSuggestion } from "./commit-suggestion.mts";

describe("runCommitSuggestion — output shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    mockFetchBatch.mockResolvedValue({ data: makeBatch([makeThread()]) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockReadFile as any).mockResolvedValue(FILE_CONTENT);
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
      if (cmd === "git" && args[0] === "status") return makeGitSuccess(""); // file is clean
      throw new Error(`Unexpected execFile: ${cmd} ${args.join(" ")}`);
    });
  });

  it("postActionInstructions step 1 mentions the file path and line range", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "rename x",
    });
    expect(result.postActionInstructions[0]).toContain("src/foo.ts");
    expect(result.postActionInstructions[0]).toContain("line 5");
  });

  it("postActionInstructions step 2 stages the exact file", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "rename x",
    });
    expect(result.postActionInstructions[1]).toContain("git add");
    expect(result.postActionInstructions[1]).toContain("src/foo.ts");
  });

  it("postActionInstructions step 3 includes the literal commit message", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "rename x to const",
    });
    expect(result.postActionInstructions[2]).toContain("git commit");
    expect(result.postActionInstructions[2]).toContain("rename x to const");
  });

  it("postActionInstructions step 4 resolves the thread", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    expect(result.postActionInstructions[3]).toContain("pr-shepherd resolve");
    expect(result.postActionInstructions[3]).toContain("PRRT_x");
  });

  it("postActionInstructions step 5 mentions git push", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    expect(result.postActionInstructions[4]).toContain("git push");
  });

  it("multi-line range label in step 1 uses en-dash notation", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ line: 7, startLine: 5 })]),
    });
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    expect(result.postActionInstructions[0]).toContain("lines 5–7");
  });

  it("commitBody contains Co-authored-by with correct author login", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    expect(result.commitBody).toBe("Co-authored-by: alice <alice@users.noreply.github.com>");
  });

  it("commitBody prepends description before Co-authored-by with blank separator", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
      description: "Reviewer asked to use const.",
    });
    expect(result.commitBody).toBe(
      "Reviewer asked to use const.\n\nCo-authored-by: alice <alice@users.noreply.github.com>",
    );
  });

  it("filesToStage contains only the thread's file path", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    expect(result.filesToStage).toEqual(["src/foo.ts"]);
  });

  it("patch contains the unified diff with the replacement line", async () => {
    const result = await runCommitSuggestion({
      ...GLOBAL_OPTS,
      threadId: "PRRT_x",
      message: "fix",
    });
    expect(result.patch).toContain("-const x = 1;");
    expect(result.patch).toContain("+const x = 10;");
  });
});
