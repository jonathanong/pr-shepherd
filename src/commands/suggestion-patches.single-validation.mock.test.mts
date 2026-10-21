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
  runSingleSuggestion,
} from "../../test-helpers/commands/suggestion-patches.single.test-support.mts";

registerHooks();

describe("runSuggestionPatches (single) — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    mockFetchBatch.mockResolvedValue({ data: makeBatch([makeThread()]) });
    mockExecFile.mockImplementation(() => makeGitSuccess(""));
  });

  it("throws when --thread-id is empty", async () => {
    await expect(
      runSingleSuggestion({ ...GLOBAL_OPTS, threadId: "", message: "fix" }),
    ).rejects.toThrow("--thread-id is required");
  });

  it("throws when --message is empty", async () => {
    await expect(
      runSingleSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "" }),
    ).rejects.toThrow("--message is required");
  });

  it("throws when --message is whitespace only", async () => {
    await expect(
      runSingleSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "   " }),
    ).rejects.toThrow("--message is required");
  });
});
