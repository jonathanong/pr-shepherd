import { describe, it, expect, vi } from "vitest";
import {
  registerHooks,
  GLOBAL_OPTS,
  makeBatch,
  makeGitSuccess,
  makeThread,
  mockExecFile,
  mockFetchBatch,
  mockGetCurrentBranch,
  mockReadFile,
} from "./commit-suggestion.test-support.mts";
import { runCommitSuggestion } from "./commit-suggestion.mts";

registerHooks();

describe("runCommitSuggestion — file read failure", () => {
  it("propagates the underlying readFile error when file cannot be read", async () => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    mockFetchBatch.mockResolvedValue({ data: makeBatch([makeThread()]) });
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
      return makeGitSuccess("");
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockReadFile as any).mockRejectedValue(
      Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" }),
    );

    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toThrow("ENOENT");
  });
});
