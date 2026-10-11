/* eslint-disable max-lines */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRunCommitSuggestion,
  mockRunSuggestionPatches,
  mockRunIterate,
  mockRunJournal,
  mockRunMarkFilesAsViewed,
  mockRunResolveMutate,
  mockGetRepoInfo,
  mockGetPullRequestBody,
  mockRunPollSummary,
  mockApplyQueueRemovalAck,
} = vi.hoisted(() => ({
  mockRunCommitSuggestion: vi.fn(),
  mockRunSuggestionPatches: vi.fn(),
  mockRunIterate: vi.fn(),
  mockRunJournal: vi.fn(),
  mockRunMarkFilesAsViewed: vi.fn(),
  mockRunResolveMutate: vi.fn(),
  mockGetRepoInfo: vi.fn(),
  mockGetPullRequestBody: vi.fn(),
  mockRunPollSummary: vi.fn(),
  mockApplyQueueRemovalAck: vi.fn(),
}));

vi.mock("./commands/commit-suggestion.mts", () => ({
  runCommitSuggestion: mockRunCommitSuggestion,
}));
vi.mock("./commands/suggestion-patches.mts", () => ({
  runSuggestionPatches: mockRunSuggestionPatches,
}));
vi.mock("./commands/iterate/index.mts", () => ({ runIterate: mockRunIterate }));
vi.mock("./commands/poll-summary.mts", () => ({ runPollSummary: mockRunPollSummary }));
vi.mock("./commands/journal/index.mts", () => ({ runJournal: mockRunJournal }));
vi.mock("./commands/mark-files-as-viewed.mts", () => ({
  runMarkFilesAsViewed: mockRunMarkFilesAsViewed,
}));
vi.mock("./commands/resolve-mutate.mts", () => ({ runResolveMutate: mockRunResolveMutate }));
vi.mock("./commands/apply-queue-removal.mts", () => ({
  applyQueueRemovalAck: mockApplyQueueRemovalAck,
}));
vi.mock("./github/client.mts", () => ({
  getRepoInfo: mockGetRepoInfo,
  getPullRequestBody: mockGetPullRequestBody,
}));

import {
  createPrShepherd,
  type IterateInput,
  PartialApplyError,
  PrShepherdValidationError,
} from "./api.mts";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRepoInfo.mockResolvedValue({ owner: "openai", name: "pr-shepherd" });
  mockGetPullRequestBody.mockResolvedValue({ nodeId: "PR_42", body: "" });
});

describe("public API", () => {
  it("exposes the supported operations and translates a GitHub PR URL", async () => {
    mockRunIterate.mockResolvedValue({ action: "wait" });
    const shepherd = createPrShepherd();

    expect(Object.keys(shepherd).sort()).toEqual([
      "apply",
      "buildSuggestionPatch",
      "buildSuggestionPatches",
      "getJournal",
      "iterate",
    ]);
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
      expect.objectContaining({
        prNumber: 42,
        targetRepository: { owner: "openai", name: "pr-shepherd" },
        format: "json",
      }),
    );
  });

  it("fetches one qualified PR body through GraphQL and returns only its journal extraction", async () => {
    mockGetPullRequestBody.mockResolvedValue({
      nodeId: "PR_42",
      body: "<details>\n<summary>Shepherd Journal</summary>\n\n- first decision\n  with context\n- second decision\n</details>",
    });

    const extracted = await createPrShepherd({ cwd: "." }).getJournal({ pr: "other/widgets#42" });

    expect(mockGetPullRequestBody).toHaveBeenCalledOnce();
    expect(mockGetPullRequestBody).toHaveBeenCalledWith(42, "other", "widgets");
    expect(mockGetRepoInfo).not.toHaveBeenCalled();
    expect(extracted).toEqual({
      ok: true,
      journal: {
        format: "details",
        entries: ["- first decision\n  with context", "- second decision"],
      },
    });
  });

  it("uses the checkout repository for a numeric PR and preserves malformed extraction results", async () => {
    mockGetPullRequestBody.mockResolvedValue({
      nodeId: "PR_7",
      body: "## Shepherd Journal\n\ninvalid",
    });

    const extracted = await createPrShepherd().getJournal({ pr: 7 });

    expect(mockGetPullRequestBody).toHaveBeenCalledWith(7, "openai", "pr-shepherd");
    expect(extracted).toEqual({
      ok: false,
      error: "Shepherd Journal content uses an unrecognized entry format",
    });
  });

  it("returns an absent journal without exposing the PR body and propagates a GitHub read failure", async () => {
    const shepherd = createPrShepherd();
    expect(await shepherd.getJournal({ pr: "openai/pr-shepherd#42" })).toEqual({
      ok: true,
      journal: null,
    });

    const failure = new Error("GitHub body read failed");
    mockGetPullRequestBody.mockRejectedValueOnce(failure);
    await expect(shepherd.getJournal({ pr: "openai/pr-shepherd#42" })).rejects.toBe(failure);
  });

  it("rejects an invalid journal PR before any GitHub request", async () => {
    await expect(createPrShepherd().getJournal({ pr: "invalid" })).rejects.toBeInstanceOf(
      PrShepherdValidationError,
    );
    expect(mockGetPullRequestBody).not.toHaveBeenCalled();
  });

  it("routes plural and native-stack iterate inputs to one read-only summary tick", async () => {
    mockRunPollSummary.mockResolvedValue({ mode: "summary", prs: [] });
    const shepherd = createPrShepherd();

    await shepherd.iterate({ prs: ["openai/pr-shepherd#42", "openai/pr-shepherd#43"] });
    expect(mockRunPollSummary).toHaveBeenLastCalledWith({
      prNumbers: [42, 43],
      targetRepository: { owner: "openai", name: "pr-shepherd" },
    });

    await shepherd.iterate({ stack: "openai/pr-shepherd#43", merge: true });
    expect(mockRunPollSummary).toHaveBeenLastCalledWith({
      stackPrNumber: 43,
      targetRepository: { owner: "openai", name: "pr-shepherd" },
      merge: true,
    });
    expect(mockRunIterate).not.toHaveBeenCalled();
  });

  it("rejects cross-repository aggregate iterate input", async () => {
    const shepherd = createPrShepherd();
    await expect(
      shepherd.iterate({ prs: ["openai/pr-shepherd#42", "other/widgets#43"] }),
    ).rejects.toThrow("one repository");
    expect(mockRunPollSummary).not.toHaveBeenCalled();
  });

  it("accepts aggregate repository references with different casing", async () => {
    const shepherd = createPrShepherd();
    await shepherd.iterate({ prs: ["OpenAI/Pr-Shepherd#42", "openai/pr-shepherd#43"] });
    expect(mockRunPollSummary).toHaveBeenCalledWith(
      expect.objectContaining({ prNumbers: [42, 43] }),
    );
  });

  it("rejects conflicting runtime selectors", async () => {
    const shepherd = createPrShepherd();
    await expect(shepherd.iterate({ pr: 42, prs: [43] } as never)).rejects.toThrow(
      "mutually exclusive",
    );
    await expect(shepherd.iterate({ prs: [42], stack: 43 } as never)).rejects.toThrow(
      "mutually exclusive",
    );
    expect(mockRunPollSummary).not.toHaveBeenCalled();
    expect(mockRunIterate).not.toHaveBeenCalled();
  });

  it("rejects empty and malformed aggregate selectors", async () => {
    const shepherd = createPrShepherd();
    await expect(shepherd.iterate({ prs: [] })).rejects.toThrow("at least one");
    await expect(shepherd.iterate({ prs: ["bad"] })).rejects.toThrow("Invalid PR reference");
    expect(mockGetRepoInfo).not.toHaveBeenCalled();
    expect(mockRunPollSummary).not.toHaveBeenCalled();
  });

  it("accepts a caller variable typed as the iterate selector union", async () => {
    const shepherd = createPrShepherd();
    const input: IterateInput = { prs: [42, 43] };
    await shepherd.iterate(input);
    expect(mockRunPollSummary).toHaveBeenCalled();
  });

  it("accepts a fork owner/repo#number shorthand without consulting the checkout repository", async () => {
    const shepherd = createPrShepherd();

    await shepherd.iterate({ pr: "other/widgets#42" });

    expect(mockRunIterate).toHaveBeenCalledWith(
      expect.objectContaining({
        prNumber: 42,
        targetRepository: { owner: "other", name: "widgets" },
        format: "json",
      }),
    );
    expect(mockGetRepoInfo).not.toHaveBeenCalled();
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

  it("validates queue-removal SHAs and timestamp before any ordered mutation", async () => {
    const shepherd = createPrShepherd();
    await expect(
      shepherd.apply({
        operations: [
          { type: "review_mutations", resolveThreadIds: ["PRRT_one"] },
          {
            type: "acknowledge_queue_removal",
            requireSha: "short",
            queueCommitOid: "b".repeat(40),
            removedAtUnix: 1_700_000_000,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(PrShepherdValidationError);
    expect(mockRunResolveMutate).not.toHaveBeenCalled();
    expect(mockApplyQueueRemovalAck).not.toHaveBeenCalled();
  });

  it.each(["requireSha", "queueCommitOid"])(
    "rejects coercible non-string %s before earlier operations run",
    async (field) => {
      const operation = {
        type: "acknowledge_queue_removal" as const,
        requireSha: "a".repeat(40),
        queueCommitOid: "b".repeat(40),
        removedAtUnix: 1_700_000_000,
      };
      operation[field as "requireSha" | "queueCommitOid"] = ["a".repeat(40)] as unknown as string;
      await expect(
        createPrShepherd().apply({
          operations: [{ type: "review_mutations", resolveThreadIds: ["PRRT_one"] }, operation],
        }),
      ).rejects.toThrow(
        `acknowledge_queue_removal.${field} must be a full 40-character lowercase hex SHA`,
      );
      expect(mockRunResolveMutate).not.toHaveBeenCalled();
      expect(mockApplyQueueRemovalAck).not.toHaveBeenCalled();
    },
  );

  it("routes a validated queue-removal acknowledgment to the shared helper", async () => {
    const result = {
      pr: 42,
      repo: "acme/widgets",
      acknowledgment: {
        headSha: "a".repeat(40),
        queueCommitOid: "b".repeat(40),
        removedAtUnix: 1_700_000_000,
      },
    };
    mockApplyQueueRemovalAck.mockResolvedValue(result);
    await expect(
      createPrShepherd().apply({
        pr: "acme/widgets#42",
        operations: [
          {
            type: "acknowledge_queue_removal",
            requireSha: "a".repeat(40),
            queueCommitOid: "b".repeat(40),
            removedAtUnix: 1_700_000_000,
          },
        ],
      }),
    ).resolves.toEqual({
      operations: [{ type: "acknowledge_queue_removal", result }],
    });
    expect(mockApplyQueueRemovalAck).toHaveBeenCalledWith({
      prNumber: 42,
      targetRepository: { owner: "acme", name: "widgets" },
      headSha: "a".repeat(40),
      queueCommitOid: "b".repeat(40),
      removedAtUnix: 1_700_000_000,
    });
  });

  it("resolves review_mutations requireSha HEAD to this checkout's commit", async () => {
    mockRunResolveMutate.mockResolvedValue({ resolvedThreads: ["PRRT_one"] });
    await createPrShepherd().apply({
      pr: 7,
      operations: [
        { type: "review_mutations", resolveThreadIds: ["PRRT_one"], requireSha: "HEAD" },
      ],
    });
    expect(mockRunResolveMutate).toHaveBeenCalledWith(
      expect.objectContaining({ requireSha: expect.stringMatching(/^[0-9a-f]{40}$/) }),
    );
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

  it("stops later apply operations after returning partial review mutations on session refusal", async () => {
    const result = {
      repliedThreads: ["PRRT_done"],
      resolvedThreads: [],
      minimizedComments: [],
      dismissedReviews: [],
      errors: [],
      sessionRefusal: "proxy session refusal",
      instructions: [
        "Restore GitHub access for this session using the proxy instructions above.",
        "Retry only the pending IDs listed above.",
      ],
      unrepliedThreads: ["PRRT_pending"],
    };
    mockRunResolveMutate.mockResolvedValue(result);
    const response = await createPrShepherd().apply({
      pr: 7,
      operations: [
        {
          type: "review_mutations",
          replyThreadIds: ["PRRT_done", "PRRT_pending"],
          message: "Done",
        },
        { type: "mark_files_viewed", files: ["src/api.mts"] },
      ],
    });

    expect(response).toEqual({
      operations: [{ type: "review_mutations", result }],
    });
    expect(mockRunMarkFilesAsViewed).not.toHaveBeenCalled();
  });

  it("runs every operation in order and builds suggestion patches in the configured cwd", async () => {
    mockRunResolveMutate.mockResolvedValue({ resolvedThreads: ["PRRT_one"] });
    mockRunMarkFilesAsViewed.mockResolvedValue({ markedPaths: ["src/api.mts"] });
    mockRunJournal.mockResolvedValue({ prNumber: 9, mutated: true });
    mockRunCommitSuggestion.mockResolvedValue({ threadId: "PRRT_two" });
    mockRunSuggestionPatches.mockResolvedValue({ patches: [{ threadId: "PRRT_two" }] });
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
    await shepherd.buildSuggestionPatches({
      pr: 9,
      suggestions: [{ threadId: "PRRT_two", message: "apply suggestion", description: "Covered." }],
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
    expect(mockRunSuggestionPatches).toHaveBeenCalledWith(
      expect.objectContaining({
        prNumber: 9,
        format: "json",
        suggestions: [
          { threadId: "PRRT_two", message: "apply suggestion", description: "Covered." },
        ],
      }),
    );
  });

  it("routes every API operation to a qualified fork even when the PR number collides", async () => {
    mockRunResolveMutate.mockResolvedValue({ resolvedThreads: ["PRRT_one"] });
    mockRunMarkFilesAsViewed.mockResolvedValue({ markedPaths: ["src/api.mts"] });
    mockRunJournal.mockResolvedValue({ prNumber: 42, mutated: true });
    mockRunCommitSuggestion.mockResolvedValue({ threadId: "PRRT_two" });
    mockRunSuggestionPatches.mockResolvedValue({ patches: [{ threadId: "PRRT_two" }] });
    const shepherd = createPrShepherd({ cwd: "." });
    const pr = "https://github.com/fork/widgets/pull/42";

    await shepherd.apply({
      pr,
      operations: [
        { type: "review_mutations", resolveThreadIds: ["PRRT_one"] },
        { type: "mark_files_viewed", files: ["src/api.mts"] },
        { type: "append_journal", item: "- Routed to fork." },
      ],
    });
    await shepherd.buildSuggestionPatch({ pr, threadId: "PRRT_two", message: "Apply it" });
    await shepherd.buildSuggestionPatches({
      pr,
      suggestions: [{ threadId: "PRRT_two", message: "Apply it" }],
    });

    const target = { owner: "fork", name: "widgets" };
    expect(mockRunResolveMutate).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 42, targetRepository: target }),
    );
    expect(mockRunMarkFilesAsViewed).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 42, targetRepository: target }),
    );
    expect(mockRunJournal).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 42, targetRepository: target }),
    );
    expect(mockRunCommitSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 42, targetRepository: target }),
    );
    expect(mockRunSuggestionPatches).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 42, targetRepository: target }),
    );
    expect(mockGetRepoInfo).not.toHaveBeenCalled();
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

  it("accepts a cross-repository PR URL before calling an operation", async () => {
    const shepherd = createPrShepherd({ cwd: "." });

    await shepherd.iterate({ pr: "https://github.com/other/widgets/pull/42" });

    expect(mockRunIterate).toHaveBeenCalledWith(
      expect.objectContaining({
        prNumber: 42,
        targetRepository: { owner: "other", name: "widgets" },
        format: "json",
      }),
    );
    expect(mockGetRepoInfo).not.toHaveBeenCalled();
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
      "invalid queue-removal head SHA",
      {
        operations: [
          {
            type: "acknowledge_queue_removal",
            requireSha: "abc",
            queueCommitOid: "b".repeat(40),
            removedAtUnix: 1_700_000_000,
          },
        ],
      },
    ],
    [
      "invalid queue-removal commit SHA",
      {
        operations: [
          {
            type: "acknowledge_queue_removal",
            requireSha: "a".repeat(40),
            queueCommitOid: "abc",
            removedAtUnix: 1_700_000_000,
          },
        ],
      },
    ],
    [
      "invalid queue-removal timestamp",
      {
        operations: [
          {
            type: "acknowledge_queue_removal",
            requireSha: "a".repeat(40),
            queueCommitOid: "b".repeat(40),
            removedAtUnix: 0,
          },
        ],
      },
    ],
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
    ["missing thread", { threadId: " ", message: "message" }],
    ["missing message", { threadId: "PRRT_one", message: " " }],
    ["invalid description", { threadId: "PRRT_one", message: "message", description: 1 }],
    ["invalid PR number", { pr: 0, threadId: "PRRT_one", message: "message" }],
  ])("validates suggestion patch input: %s", (_label, input) => {
    expect(() => createPrShepherd().buildSuggestionPatch(input as never)).toThrow(
      PrShepherdValidationError,
    );
  });

  it.each([
    ["missing suggestions", {}],
    ["empty suggestions", { suggestions: [] }],
    ["missing thread", { suggestions: [{ threadId: " ", message: "message" }] }],
    ["missing message", { suggestions: [{ threadId: "PRRT_one", message: " " }] }],
    [
      "invalid description",
      { suggestions: [{ threadId: "PRRT_one", message: "message", description: 42 }] },
    ],
    [
      "duplicate thread",
      {
        suggestions: [
          { threadId: "PRRT_one", message: "one" },
          { threadId: "PRRT_one", message: "two" },
        ],
      },
    ],
  ])("validates suggestion patches input: %s", (_label, input) => {
    expect(() => createPrShepherd().buildSuggestionPatches(input as never)).toThrow(
      PrShepherdValidationError,
    );
  });
});
