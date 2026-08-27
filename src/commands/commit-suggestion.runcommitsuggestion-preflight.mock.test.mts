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
  mockGetCurrentPrNumber,
} from "../../test-helpers/commands/commit-suggestion.test-support.mts";
import { runCommitSuggestion } from "./commit-suggestion.mts";

registerHooks();

describe("runCommitSuggestion — preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    mockFetchBatch.mockResolvedValue({ data: makeBatch([makeThread()]) });
  });

  it("throws when no open PR is found for current branch", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    mockExecFile.mockImplementation(() => makeGitSuccess(""));
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("No open PR found");
  });

  it("throws when current branch does not match PR head ref", async () => {
    mockGetCurrentBranch.mockResolvedValue("wrong-branch");
    mockExecFile.mockImplementation(() => makeGitSuccess("headsha\n"));
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow('does not match PR head branch "feature/foo"');
  });

  it("throws when local HEAD is not the PR head or its descendant", async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("divergedsha\n");
      if (cmd === "git" && args[0] === "merge-base") {
        return Promise.reject(Object.assign(new Error("not ancestor"), { code: 1 }));
      }
      return makeGitSuccess("");
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("is not PR head headsha or its descendant");
  });

  it("throws when head repository is unavailable (deleted fork)", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread()], null),
    });
    mockExecFile.mockImplementation(() => makeGitSuccess("headsha\n"));
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("head repository is unavailable");
  });

  it("throws when the target file has uncommitted local changes", async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
      if (cmd === "git" && args[0] === "status") return makeGitSuccess("M src/foo.ts\n");
      return makeGitSuccess("");
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("uncommitted changes");
  });

  it("throws when the thread path escapes the working tree", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ path: "../secret.ts" })]),
    });
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
      return makeGitSuccess("");
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("path escapes the working tree");
  });

  it("throws when the thread path resolves to the working tree root", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ path: "." })]),
    });
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
      return makeGitSuccess("");
    });
    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("path escapes the working tree");
  });
});
