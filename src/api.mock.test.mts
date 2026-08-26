/* eslint-disable max-lines */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRunCommitSuggestion,
  mockRunIterate,
  mockRunJournal,
  mockRunMarkFilesAsViewed,
  mockRunResolveMutate,
  mockGetRepoInfo,
} = vi.hoisted(() => ({
  mockRunCommitSuggestion: vi.fn(),
  mockRunIterate: vi.fn(),
  mockRunJournal: vi.fn(),
  mockRunMarkFilesAsViewed: vi.fn(),
  mockRunResolveMutate: vi.fn(),
  mockGetRepoInfo: vi.fn(),
}));

vi.mock("./commands/commit-suggestion.mts", () => ({
  runCommitSuggestion: mockRunCommitSuggestion,
}));
vi.mock("./commands/iterate/index.mts", () => ({ runIterate: mockRunIterate }));
vi.mock("./commands/journal/index.mts", () => ({ runJournal: mockRunJournal }));
vi.mock("./commands/mark-files-as-viewed.mts", () => ({
  runMarkFilesAsViewed: mockRunMarkFilesAsViewed,
}));
vi.mock("./commands/resolve-mutate.mts", () => ({ runResolveMutate: mockRunResolveMutate }));
vi.mock("./github/client.mts", () => ({ getRepoInfo: mockGetRepoInfo }));

import { createPrShepherd, PartialApplyError, PrShepherdValidationError } from "./api.mts";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRepoInfo.mockResolvedValue({ owner: "openai", name: "pr-shepherd" });
});

describe("public API", () => {
  it("exposes only the three supported operations and translates a GitHub PR URL", async () => {
    mockRunIterate.mockResolvedValue({ action: "wait" });
    const shepherd = createPrShepherd();

    expect(Object.keys(shepherd).sort()).toEqual(["apply", "buildSuggestionPatch", "iterate"]);
    await shepherd.iterate({ pr: "https://github.com/openai/pr-shepherd/pull/42" });

    expect(mockRunIterate).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 42, format: "json" }),
    );
  });

  it("accepts an owner/repo#number shorthand and translates it", async () => {
    mockRunIterate.mockResolvedValue({ action: "wait" });
    const shepherd = createPrShepherd();

    await shepherd.iterate({ pr: "openai/pr-shepherd#42" });

    expect(mockRunIterate).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 42, format: "json" }),
    );
  });

  it("rejects a mismatched owner/repo#number shorthand before running the command", async () => {
    const shepherd = createPrShepherd();

    await expect(shepherd.iterate({ pr: "other/widgets#42" })).rejects.toThrow(
      "PR reference repository other/widgets does not match the configured repository openai/pr-shepherd",
    );

    expect(mockRunIterate).not.toHaveBeenCalled();
  });

  it.each([
    ["a numeric PR", { pr: 42 }],
    ["an omitted PR", {}],
  ])("keeps API compatibility for %s", async (_label, input) => {
    mockRunIterate.mockResolvedValue({ action: "wait" });
    const shepherd = createPrShepherd();

    await shepherd.iterate(input);

    expect(mockRunIterate).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: "pr" in input ? 42 : undefined, format: "json" }),
    );
  });

  it("validates every operation before starting any mutation", async () => {
    const shepherd = createPrShepherd();

    await expect(
      shepherd.apply({
        operations: [
          { type: "review_mutations", resolveThreadIds: ["PRRT_one"] },
          { type: "append_journal", item: "not a list item" },
        ],
      }),
    ).rejects.toBeInstanceOf(PrShepherdValidationError);

    expect(mockRunResolveMutate).not.toHaveBeenCalled();
  });

  it("preserves operation order, translates message, and reports completed work after a failure", async () => {
    mockRunResolveMutate.mockResolvedValue({ resolvedThreads: ["PRRT_one"] });
    mockRunMarkFilesAsViewed.mockRejectedValue(new Error("GitHub unavailable"));
    const shepherd = createPrShepherd();

    const error = await shepherd
      .apply({
        pr: 7,
        operations: [
          {
            type: "review_mutations",
            resolveThreadIds: ["PRRT_one"],
            message: "Fixed it",
          },
          { type: "mark_files_viewed", files: ["src/api.mts"] },
        ],
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PartialApplyError);
    expect(error).toMatchObject({ failedIndex: 1, completed: [{ type: "review_mutations" }] });
    expect(mockRunResolveMutate).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 7, dismissMessage: "Fixed it", format: "json" }),
    );
  });

  it("runs every operation in order and builds suggestion patches in the configured cwd", async () => {
    mockRunResolveMutate.mockResolvedValue({ resolvedThreads: ["PRRT_one"] });
    mockRunMarkFilesAsViewed.mockResolvedValue({ markedPaths: ["src/api.mts"] });
    mockRunJournal.mockResolvedValue({ prNumber: 9, mutated: true });
    mockRunCommitSuggestion.mockResolvedValue({ threadId: "PRRT_two" });
    mockGetRepoInfo.mockResolvedValue({ owner: "acme", name: "widgets" });
    const shepherd = createPrShepherd({ cwd: "." });

    await expect(
      shepherd.apply({
        pr: "https://www.github.com/acme/widgets/pull/9",
        operations: [
          { type: "review_mutations", resolveThreadIds: ["PRRT_one"] },
          { type: "mark_files_viewed", tests: true },
          { type: "append_journal", item: "- Covered the public API.", dryRun: true },
        ],
      }),
    ).resolves.toEqual({
      operations: [
        { type: "review_mutations", result: { resolvedThreads: ["PRRT_one"] } },
        { type: "mark_files_viewed", result: { markedPaths: ["src/api.mts"] } },
        { type: "append_journal", result: { prNumber: 9, mutated: true } },
      ],
    });

    await shepherd.buildSuggestionPatch({
      pr: 9,
      threadId: "PRRT_two",
      message: "apply suggestion",
      description: "Keep the API covered.",
    });

    expect(mockRunMarkFilesAsViewed).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 9, files: [], tests: true, format: "json" }),
    );
    expect(mockRunJournal).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 9, dryRun: true }),
    );
    expect(mockRunCommitSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 9, threadId: "PRRT_two", format: "json" }),
    );
  });

  it("rethrows a failure from the first apply operation unchanged", async () => {
    const failure = new Error("first operation failed");
    mockRunResolveMutate.mockRejectedValue(failure);

    await expect(
      createPrShepherd().apply({
        operations: [{ type: "review_mutations", resolveThreadIds: ["PRRT_one"] }],
      }),
    ).rejects.toBe(failure);
  });

  it("rejects a cross-repository PR URL before calling an operation", async () => {
    const shepherd = createPrShepherd({ cwd: "." });

    await expect(
      shepherd.iterate({ pr: "https://github.com/other/widgets/pull/42" }),
    ).rejects.toThrow(
      "PR reference repository other/widgets does not match the configured repository openai/pr-shepherd",
    );

    expect(mockRunIterate).not.toHaveBeenCalled();
  });

  it.each([
    ["missing operations", null],
    ["non-object operation", { operations: [null] }],
    ["non-string journal item", { operations: [{ type: "append_journal", item: 1 }] }],
    [
      "non-boolean journal dryRun",
      { operations: [{ type: "append_journal", item: "- item", dryRun: "yes" }] },
    ],
    ["unsupported operation", { operations: [{ type: "unknown" }] }],
    ["empty review mutation", { operations: [{ type: "review_mutations" }] }],
    [
      "missing review reply message",
      { operations: [{ type: "review_mutations", replyThreadIds: ["PRRT_one"] }] },
    ],
    [
      "non-string review message",
      {
        operations: [{ type: "review_mutations", resolveThreadIds: ["PRRT_one"], message: 1 }],
      },
    ],
    [
      "invalid required SHA",
      {
        operations: [
          { type: "review_mutations", resolveThreadIds: ["PRRT_one"], requireSha: "abc" },
        ],
      },
    ],
    ["non-string review ID", { operations: [{ type: "review_mutations", resolveThreadIds: [1] }] }],
    ["non-boolean tests selector", { operations: [{ type: "mark_files_viewed", tests: 1 }] }],
    ["empty file selectors", { operations: [{ type: "mark_files_viewed" }] }],
    [
      "invalid match pattern",
      { operations: [{ type: "mark_files_viewed", matchPatterns: ["["] }] },
    ],
    ["invalid PR", { pr: "not-a-url", operations: [{ type: "mark_files_viewed", tests: true }] }],
  ])("rejects %s before mutation", async (_label, input) => {
    await expect(createPrShepherd().apply(input as never)).rejects.toBeInstanceOf(
      PrShepherdValidationError,
    );
  });

  it.each([
    ["missing thread", { threadId: "", message: "message" }],
    ["missing message", { threadId: "PRRT_one", message: " " }],
    ["invalid description", { threadId: "PRRT_one", message: "message", description: 1 }],
    ["invalid PR number", { pr: 0, threadId: "PRRT_one", message: "message" }],
  ])("validates suggestion patch input: %s", (_label, input) => {
    expect(() => createPrShepherd().buildSuggestionPatch(input as never)).toThrow(
      PrShepherdValidationError,
    );
  });
});
