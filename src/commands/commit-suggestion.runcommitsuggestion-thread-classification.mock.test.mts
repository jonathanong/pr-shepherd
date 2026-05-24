import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerHooks,
  GLOBAL_OPTS,
  makeBatch,
  makeGitSuccess,
  makeThread,
  mockExecFile,
  mockFetchBatch,
  mockGetCurrentBranch,
} from "../../test-helpers/commands/commit-suggestion.test-support.mts";
import { runCommitSuggestion } from "./commit-suggestion.mts";

registerHooks();

describe("runCommitSuggestion — thread classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
      return makeGitSuccess("");
    });
  });

  it("throws when thread not found on PR", async () => {
    mockFetchBatch.mockResolvedValue({ data: makeBatch([]) });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_missing", message: "fix" }),
    ).rejects.toThrow("not found on PR");
  });

  it("throws when thread is already resolved", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ id: "PRRT_x", isResolved: true })]),
      rateLimit: undefined,
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("already resolved");
  });

  it("throws when thread is outdated", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ id: "PRRT_x", isOutdated: true })]),
      rateLimit: undefined,
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("outdated");
  });

  it("throws when thread is minimized", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ id: "PRRT_x", isMinimized: true })]),
      rateLimit: undefined,
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("minimized");
  });

  it("throws when thread has no file/line anchor", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ id: "PRRT_x", path: null, line: null })]),
      rateLimit: undefined,
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("no file/line anchor");
  });

  it("throws when thread has no suggestion block", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ body: "just a comment, no suggestion" })]),
      rateLimit: undefined,
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("no suggestion block");
  });

  it("throws when suggestion has nested fencing (isCommittableSuggestion guard)", async () => {
    const body = "```suggestion\ntext ```suggestion nested\n```";
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ body })]),
      rateLimit: undefined,
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("nested suggestion fencing");
  });
});
