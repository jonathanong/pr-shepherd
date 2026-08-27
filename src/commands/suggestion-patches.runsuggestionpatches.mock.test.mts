import { beforeEach, describe, expect, it, vi } from "vitest";
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
  registerHooks,
} from "../../test-helpers/commands/commit-suggestion.test-support.mts";
import { runSuggestionPatches } from "./suggestion-patches.mts";

registerHooks();

describe("runSuggestionPatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    mockReadFile.mockResolvedValue(FILE_CONTENT);
  });

  it("accepts a local descendant and checks ordered patches before returning", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([
        makeThread({ id: "PRRT_one" }),
        makeThread({
          id: "PRRT_two",
          line: 6,
          body: "```suggestion\nchanged line6\n```",
        }),
      ]),
    });
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("localsha\n");
      if (cmd === "git" && args[0] === "merge-base") return makeGitSuccess();
      if (cmd === "git" && args[0] === "status") return makeGitSuccess();
      if (cmd === "git" && args[0] === "apply") return makeGitSuccess();
      throw new Error(`Unexpected exec: ${cmd} ${args.join(" ")}`);
    });

    const result = await runSuggestionPatches({
      ...GLOBAL_OPTS,
      suggestions: [
        { threadId: "PRRT_one", message: "reviewer's fix" },
        { threadId: "PRRT_two", message: "second", description: "details" },
      ],
    });

    expect(result.patches.map((patch) => patch.threadId)).toEqual(["PRRT_one", "PRRT_two"]);
    expect(result.postActionInstructions.filter((step) => step.includes("Push once"))).toHaveLength(
      1,
    );
    expect(result.postActionInstructions).toContainEqual(
      expect.stringContaining(String.raw`'reviewer'\''s fix'`),
    );
    expect(mockExecFile).toHaveBeenCalledWith("git", [
      "merge-base",
      "--is-ancestor",
      "headsha",
      "localsha",
    ]);
    const applyCall = mockExecFile.mock.calls.find(
      (call) => call[0] === "git" && call[1][0] === "apply",
    );
    expect(applyCall?.[1]).toEqual(["apply", "--check"]);
    expect(applyCall?.[2]).toContain("+const x = 10;");
    expect(applyCall?.[2]).toContain("+changed line6");
  });

  it("returns no result when the ordered apply check fails", async () => {
    mockFetchBatch.mockResolvedValue({ data: makeBatch([makeThread()]) });
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse") return makeGitSuccess("headsha\n");
      if (cmd === "git" && args[0] === "status") return makeGitSuccess();
      if (cmd === "git" && args[0] === "apply") return Promise.reject(new Error("patch failed"));
      return makeGitSuccess();
    });
    await expect(
      runSuggestionPatches({
        ...GLOBAL_OPTS,
        suggestions: [{ threadId: "PRRT_x", message: "fix" }],
      }),
    ).rejects.toThrow("patch failed");
  });

  it("rejects duplicate thread IDs before GitHub or git I/O", async () => {
    await expect(
      runSuggestionPatches({
        ...GLOBAL_OPTS,
        suggestions: [
          { threadId: "PRRT_x", message: "first" },
          { threadId: "PRRT_x", message: "second" },
        ],
      }),
    ).rejects.toThrow("Duplicate thread ID");
    expect(mockExecFile).not.toHaveBeenCalled();
  });
});
