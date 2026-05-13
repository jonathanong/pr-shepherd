// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  SUGGESTION_RESULT,
  getStdout,
  mockRunCommitSuggestion,
  runCommitSuggestion,
  stderrSpy,
} from "./cli-parser.commit-suggestion.test-support.mts";
import { main } from "./cli-parser.mts";

registerHooks();

describe("main — commit-suggestion", () => {
  it("errors when --thread-id is omitted", async () => {
    await main(["node", "shepherd", "commit-suggestion", "42", "--message", "fix"]);
    expect(process.exitCode).toBe(1);
    expect(mockRunCommitSuggestion).not.toHaveBeenCalled();
    const err = stderrSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(err).toContain("--thread-id");
  });

  it("errors when --message is omitted", async () => {
    await main(["node", "shepherd", "commit-suggestion", "42", "--thread-id", "t1"]);
    expect(process.exitCode).toBe(1);
    expect(mockRunCommitSuggestion).not.toHaveBeenCalled();
    const err = stderrSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(err).toContain("--message");
  });

  it("errors when --message is whitespace only", async () => {
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "   "]);
    expect(process.exitCode).toBe(1);
    expect(mockRunCommitSuggestion).not.toHaveBeenCalled();
    const err = stderrSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(err).toContain("--message");
  });

  it("calls runCommitSuggestion with correct args and exits 0 on success", async () => {
    mockRunCommitSuggestion.mockResolvedValue(SUGGESTION_RESULT);
    await main([
      "node",
      "shepherd",
      "commit-suggestion",
      "42",
      "--thread-id",
      "t1",
      "--message",
      "apply fix",
    ]);
    expect(mockRunCommitSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 42, threadId: "t1", message: "apply fix" }),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it("passes --description when supplied", async () => {
    mockRunCommitSuggestion.mockResolvedValue(SUGGESTION_RESULT);
    await main([
      "node",
      "shepherd",
      "commit-suggestion",
      "--thread-id",
      "t1",
      "--message",
      "fix",
      "--description",
      "more detail",
    ]);
    expect(mockRunCommitSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ description: "more detail" }),
    );
  });

  it("text output shows suggestion header with author and thread id", async () => {
    mockRunCommitSuggestion.mockResolvedValue(SUGGESTION_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "fix"]);
    const out = getStdout();
    expect(out).toContain("Suggestion from @alice");
    expect(out).toContain("PR #42");
    expect(out).toContain("thread t1");
    expect(out).toContain("a.ts (line 5)");
  });

  it("text output shows patch diff block", async () => {
    mockRunCommitSuggestion.mockResolvedValue(SUGGESTION_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "fix"]);
    const out = getStdout();
    expect(out).toContain("```diff");
    expect(out).toContain("--- a/a.ts");
  });

  it("text output handles multi-line suggestions without a patch or follow-up instructions", async () => {
    mockRunCommitSuggestion.mockResolvedValue({
      ...SUGGESTION_RESULT,
      startLine: 5,
      endLine: 7,
      patch: "",
      postActionInstructions: [],
    });
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "fix"]);
    const out = getStdout();
    expect(out).toContain("a.ts (lines 5–7)");
    expect(out).not.toContain("```diff");
    expect(out).not.toContain("## Instructions");
  });

  it("text output shows ## Suggested commit message section", async () => {
    mockRunCommitSuggestion.mockResolvedValue(SUGGESTION_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "fix"]);
    const out = getStdout();
    expect(out).toContain("## Suggested commit message");
    expect(out).toContain("apply fix");
    expect(out).toContain("Co-authored-by:");
  });

  it("text output shows ## Instructions with numbered steps", async () => {
    mockRunCommitSuggestion.mockResolvedValue(SUGGESTION_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "fix"]);
    const out = getStdout();
    expect(out).toContain("## Instructions");
    expect(out).toContain("1. Apply the patch");
    expect(out).toContain("2. Stage");
    expect(out).toContain("3. Commit");
  });

  it("json output serialises the full result", async () => {
    mockRunCommitSuggestion.mockResolvedValue(SUGGESTION_RESULT);
    await main([
      "node",
      "shepherd",
      "commit-suggestion",
      "--thread-id",
      "t1",
      "--message",
      "fix",
      "--format",
      "json",
    ]);
    const out = getStdout();
    const parsed = JSON.parse(out.trim());
    expect(parsed).toMatchObject({
      threadId: "t1",
      commitMessage: "apply fix",
      filesToStage: ["a.ts"],
    });
  });
});
