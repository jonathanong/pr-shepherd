import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRunCommitSuggestion,
  mockRunIterate,
  mockRunJournal,
  mockRunMarkFilesAsViewed,
  mockRunResolveMutate,
} = vi.hoisted(() => ({
  mockRunCommitSuggestion: vi.fn(),
  mockRunIterate: vi.fn(),
  mockRunJournal: vi.fn(),
  mockRunMarkFilesAsViewed: vi.fn(),
  mockRunResolveMutate: vi.fn(),
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

import { createPrShepherd, PartialApplyError, PrShepherdValidationError } from "./api.mts";

beforeEach(() => {
  vi.clearAllMocks();
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
});
