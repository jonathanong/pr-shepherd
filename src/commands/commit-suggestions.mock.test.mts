import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks (must appear before imports so the module picks up the mocks)
// ---------------------------------------------------------------------------

const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));

vi.mock("node:child_process", () => ({
  execFile: (
    cmd: string,
    args: string[],
    optsOrCb:
      | Record<string, unknown>
      | ((err: Error | null, result: { stdout: string; stderr: string }) => void),
    maybeCb?: (err: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => {
    const cb = typeof optsOrCb === "function" ? optsOrCb : maybeCb!;
    mockExecFile(cmd, args)
      .then((result: { stdout: string; stderr: string }) => cb(null, result))
      .catch((err: Error) => cb(err, { stdout: "", stderr: "" }));
  },
}));

vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
  getPrHead: vi.fn(),
  getFileContents: vi.fn(),
  graphql: vi.fn(),
}));

vi.mock("../github/batch.mts", () => ({
  fetchPrBatch: vi.fn(),
}));

vi.mock("../comments/resolve.mts", () => ({
  applyResolveOptions: vi.fn().mockResolvedValue({
    resolvedThreads: [],
    minimizedComments: [],
    dismissedReviews: [],
    errors: [],
  }),
}));

import { runCommitSuggestions } from "./commit-suggestions.mts";
import { getPrHead, getFileContents, graphql } from "../github/client.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { applyResolveOptions } from "../comments/resolve.mts";
import type { ReviewThread, BatchPrData } from "../types.mts";

const mockGetPrHead = vi.mocked(getPrHead);
const mockGetFileContents = vi.mocked(getFileContents);
const mockGraphql = vi.mocked(graphql);
const mockFetchBatch = vi.mocked(fetchPrBatch);
const mockApplyResolveOptions = vi.mocked(applyResolveOptions);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeThread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: "PRRT_default",
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
    path: "src/foo.ts",
    line: 2,
    startLine: null,
    author: "alice",
    body: "```suggestion\nconst x = 10;\n```",
    createdAtUnix: 0,
    ...overrides,
  };
}

function makeBatch(threads: ReviewThread[]): BatchPrData {
  return {
    nodeId: "PR_kgDOAAA",
    number: 42,
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    headRefOid: "headsha",
    baseRefName: "main",
    reviewRequests: [],
    latestReviews: [],
    reviewThreads: threads,
    comments: [],
    changesRequestedReviews: [],
    reviewSummaries: [],
    approvedReviews: [],
    checks: [],
  };
}

const GLOBAL_OPTS = { format: "json" as const, noCache: false, cacheTtlSeconds: 300 };

beforeEach(() => {
  vi.clearAllMocks();
  mockExecFile.mockResolvedValue({ stdout: "", stderr: "" });
  mockGetPrHead.mockResolvedValue({
    sha: "headsha",
    ref: "feature-branch",
    repoWithOwner: "owner/repo",
  });
  mockGetFileContents.mockResolvedValue("a\nb\nc\n");
  mockGraphql.mockResolvedValue({
    data: { createCommitOnBranch: { commit: { oid: "newsha", url: "https://commit/url" } } },
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("runCommitSuggestions — validation", () => {
  it("throws when threadIds is empty", async () => {
    await expect(
      runCommitSuggestions({ ...GLOBAL_OPTS, prNumber: 42, threadIds: [] }),
    ).rejects.toThrow("--thread-ids is required");
  });

  it("throws when the working tree is dirty", async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: " M src/foo.ts\n", stderr: "" });
    mockFetchBatch.mockResolvedValue({ data: makeBatch([makeThread({ id: "t1" })]) });
    await expect(
      runCommitSuggestions({ ...GLOBAL_OPTS, prNumber: 42, threadIds: ["t1"] }),
    ).rejects.toThrow("uncommitted changes");
  });

  it("throws when threadIds contains duplicates", async () => {
    await expect(
      runCommitSuggestions({ ...GLOBAL_OPTS, prNumber: 42, threadIds: ["t1", "t2", "t1"] }),
    ).rejects.toThrow(/duplicate ID\(s\): t1/);
  });

  it("throws when no PR is given and none can be inferred from the branch", async () => {
    const { getCurrentPrNumber } = await import("../github/client.mts");
    vi.mocked(getCurrentPrNumber).mockResolvedValueOnce(null);
    await expect(
      runCommitSuggestions({ ...GLOBAL_OPTS, prNumber: undefined, threadIds: ["t1"] }),
    ).rejects.toThrow("No open PR found");
  });
});

// ---------------------------------------------------------------------------
// Skipped cases
// ---------------------------------------------------------------------------

describe("runCommitSuggestions — skipped cases", () => {
  it("skips threads not found on the PR", async () => {
    mockFetchBatch.mockResolvedValue({ data: makeBatch([]) });
    const result = await runCommitSuggestions({
      ...GLOBAL_OPTS,
      prNumber: 42,
      threadIds: ["does-not-exist"],
    });
    expect(result.applied).toBe(false);
    expect(result.threads).toEqual([
      { id: "does-not-exist", status: "skipped", reason: "thread not found on this PR" },
    ]);
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it("skips threads already resolved", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ id: "t1", isResolved: true })]),
    });
    const result = await runCommitSuggestions({
      ...GLOBAL_OPTS,
      prNumber: 42,
      threadIds: ["t1"],
    });
    expect(result.threads[0]).toMatchObject({ status: "skipped", reason: /already resolved/ });
  });

  it("skips outdated threads", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ id: "t1", isOutdated: true })]),
    });
    const result = await runCommitSuggestions({
      ...GLOBAL_OPTS,
      prNumber: 42,
      threadIds: ["t1"],
    });
    expect(result.threads[0]).toMatchObject({ status: "skipped", reason: /outdated/ });
  });

  it("skips minimized threads (mirrors resolve --fetch's filter)", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ id: "t1", isMinimized: true })]),
    });
    const result = await runCommitSuggestions({
      ...GLOBAL_OPTS,
      prNumber: 42,
      threadIds: ["t1"],
    });
    expect(result.threads[0]).toMatchObject({ status: "skipped", reason: /minimized/ });
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it("skips threads without a parseable suggestion block", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ id: "t1", body: "just a plain comment, no suggestion" })]),
    });
    const result = await runCommitSuggestions({
      ...GLOBAL_OPTS,
      prNumber: 42,
      threadIds: ["t1"],
    });
    expect(result.threads[0]).toMatchObject({ status: "skipped", reason: /no suggestion block/ });
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it("skips threads with no file/line anchor", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ id: "t1", path: null, line: null })]),
    });
    const result = await runCommitSuggestions({
      ...GLOBAL_OPTS,
      prNumber: 42,
      threadIds: ["t1"],
    });
    expect(result.threads[0]).toMatchObject({ status: "skipped", reason: /no file\/line anchor/ });
  });

  it("returns applied=false and no commit when every thread is skipped", async () => {
    mockFetchBatch.mockResolvedValue({ data: makeBatch([]) });
    const result = await runCommitSuggestions({
      ...GLOBAL_OPTS,
      prNumber: 42,
      threadIds: ["t1"],
    });
    expect(result.applied).toBe(false);
    expect(result.newHeadSha).toBeNull();
    expect(result.commitUrl).toBeNull();
    expect(mockApplyResolveOptions).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Applied cases
// ---------------------------------------------------------------------------

describe("runCommitSuggestions — applied", () => {
  it("applies a single suggestion and commits via createCommitOnBranch", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ id: "t1", path: "src/foo.ts", line: 2, author: "alice" })]),
    });
    mockGetFileContents.mockResolvedValue("a\nb\nc\n");

    const result = await runCommitSuggestions({
      ...GLOBAL_OPTS,
      prNumber: 42,
      threadIds: ["t1"],
    });

    expect(result.applied).toBe(true);
    expect(result.newHeadSha).toBe("newsha");
    expect(result.commitUrl).toBe("https://commit/url");
    expect(result.threads).toEqual([
      { id: "t1", status: "applied", path: "src/foo.ts", author: "alice" },
    ]);

    // createCommitOnBranch was called with a single addition.
    expect(mockGraphql).toHaveBeenCalledTimes(1);
    const [, vars] = mockGraphql.mock.calls[0]!;
    expect(vars).toMatchObject({
      repoWithOwner: "owner/repo",
      branch: "feature-branch",
      expectedHeadOid: "headsha",
    });
    const additions = (vars as { additions: Array<{ path: string; contents: string }> }).additions;
    expect(additions).toHaveLength(1);
    expect(additions[0]!.path).toBe("src/foo.ts");
    // Decoded contents: line 2 was replaced with "const x = 10;".
    expect(Buffer.from(additions[0]!.contents, "base64").toString("utf8")).toBe(
      "a\nconst x = 10;\nc\n",
    );

    // Commit message has the single-author headline and a co-author trailer.
    const message = (vars as { message: { headline: string; body?: string } }).message;
    expect(message.headline).toBe("Apply suggestion from @alice");
    expect(message.body).toContain("Co-authored-by: alice <alice@users.noreply.github.com>");

    // Thread was resolved after the commit.
    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      expect.any(Object),
      expect.objectContaining({ resolveThreadIds: ["t1"] }),
    );
  });

  it("de-duplicates co-authors across multiple suggestions from the same reviewer", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([
        makeThread({
          id: "t1",
          path: "a.ts",
          line: 1,
          author: "alice",
          body: "```suggestion\nX\n```",
        }),
        makeThread({
          id: "t2",
          path: "b.ts",
          line: 1,
          author: "alice",
          body: "```suggestion\nY\n```",
        }),
      ]),
    });

    const result = await runCommitSuggestions({
      ...GLOBAL_OPTS,
      prNumber: 42,
      threadIds: ["t1", "t2"],
    });

    expect(result.applied).toBe(true);
    const [, vars] = mockGraphql.mock.calls[0]!;
    const message = (vars as { message: { headline: string; body: string } }).message;
    expect(message.headline).toBe("Apply 2 review suggestion(s)");
    const coAuthorLines = message.body
      .split("\n")
      .filter((l: string) => l.startsWith("Co-authored-by:"));
    expect(coAuthorLines).toHaveLength(1);
  });

  it("credits multiple distinct reviewers in the commit trailer", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([
        makeThread({
          id: "t1",
          path: "a.ts",
          line: 1,
          author: "alice",
          body: "```suggestion\nX\n```",
        }),
        makeThread({
          id: "t2",
          path: "b.ts",
          line: 1,
          author: "bob",
          body: "```suggestion\nY\n```",
        }),
      ]),
    });

    await runCommitSuggestions({ ...GLOBAL_OPTS, prNumber: 42, threadIds: ["t1", "t2"] });

    const [, vars] = mockGraphql.mock.calls[0]!;
    const message = (vars as { message: { body: string } }).message;
    expect(message.body).toContain("Co-authored-by: alice");
    expect(message.body).toContain("Co-authored-by: bob");
  });

  it("applies multiple non-overlapping suggestions to the same file in one commit", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([
        makeThread({ id: "t1", path: "src/foo.ts", line: 2, body: "```suggestion\nB\n```" }),
        makeThread({ id: "t2", path: "src/foo.ts", line: 4, body: "```suggestion\nD\n```" }),
      ]),
    });
    mockGetFileContents.mockResolvedValue("a\nb\nc\nd\ne\n");

    const result = await runCommitSuggestions({
      ...GLOBAL_OPTS,
      prNumber: 42,
      threadIds: ["t1", "t2"],
    });

    expect(result.threads.map((t) => t.status)).toEqual(["applied", "applied"]);
    const [, vars] = mockGraphql.mock.calls[0]!;
    const additions = (vars as { additions: Array<{ path: string; contents: string }> }).additions;
    expect(additions).toHaveLength(1);
    expect(Buffer.from(additions[0]!.contents, "base64").toString("utf8")).toBe("a\nB\nc\nD\ne\n");
  });

  it("skips a suggestion whose range overlaps another on the same file", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([
        // Applied first (higher line) — covers lines 3-4
        makeThread({
          id: "t_upper",
          path: "src/foo.ts",
          line: 4,
          startLine: 3,
          body: "```suggestion\nXX\n```",
        }),
        // Overlaps — covers lines 2-3
        makeThread({
          id: "t_lower",
          path: "src/foo.ts",
          line: 3,
          startLine: 2,
          body: "```suggestion\nYY\n```",
        }),
      ]),
    });
    mockGetFileContents.mockResolvedValue("a\nb\nc\nd\ne\n");

    const result = await runCommitSuggestions({
      ...GLOBAL_OPTS,
      prNumber: 42,
      threadIds: ["t_upper", "t_lower"],
    });

    const byId = Object.fromEntries(result.threads.map((t) => [t.id, t]));
    expect(byId["t_upper"]!.status).toBe("applied");
    expect(byId["t_lower"]!.status).toBe("skipped");
    expect(byId["t_lower"]!.reason).toMatch(/overlaps/);
  });

  it("preserves input order in the result threads array", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([
        makeThread({ id: "first", path: "a.ts", line: 1, body: "```suggestion\nA\n```" }),
        makeThread({ id: "second", path: "b.ts", line: 1, body: "```suggestion\nB\n```" }),
        makeThread({ id: "third", path: "c.ts", line: 1, body: "```suggestion\nC\n```" }),
      ]),
    });

    const result = await runCommitSuggestions({
      ...GLOBAL_OPTS,
      prNumber: 42,
      threadIds: ["second", "third", "first"],
    });

    expect(result.threads.map((t) => t.id)).toEqual(["second", "third", "first"]);
  });

  it("includes a post-action instruction to git pull when applied", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ id: "t1" })]),
    });
    const result = await runCommitSuggestions({
      ...GLOBAL_OPTS,
      prNumber: 42,
      threadIds: ["t1"],
    });
    expect(result.postActionInstruction).toMatch(/git pull --ff-only/);
  });

  it("skips a suggestion whose line range is out of bounds for the fetched file", async () => {
    // Thread anchored on line 10 but the file only has 3 lines (headsha fetch).
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([
        makeThread({ id: "t1", path: "src/foo.ts", line: 10, body: "```suggestion\nX\n```" }),
      ]),
    });
    mockGetFileContents.mockResolvedValue("a\nb\nc\n");

    const result = await runCommitSuggestions({
      ...GLOBAL_OPTS,
      prNumber: 42,
      threadIds: ["t1"],
    });

    expect(result.applied).toBe(false);
    expect(result.threads[0]).toMatchObject({ status: "skipped", reason: /out of range/ });
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it("throws when createCommitOnBranch returns a null commit (branch diverged)", async () => {
    mockFetchBatch.mockResolvedValue({ data: makeBatch([makeThread({ id: "t1" })]) });
    mockGraphql.mockResolvedValueOnce({ data: { createCommitOnBranch: { commit: null } } });

    await expect(
      runCommitSuggestions({ ...GLOBAL_OPTS, prNumber: 42, threadIds: ["t1"] }),
    ).rejects.toThrow(/branch may have diverged/);
  });

  it("throws when applyResolveOptions reports per-thread failures after the commit lands", async () => {
    mockFetchBatch.mockResolvedValue({ data: makeBatch([makeThread({ id: "t1" })]) });
    mockApplyResolveOptions.mockResolvedValueOnce({
      resolvedThreads: [],
      minimizedComments: [],
      dismissedReviews: [],
      errors: ["t1: rate limited"],
    });
    await expect(
      runCommitSuggestions({ ...GLOBAL_OPTS, prNumber: 42, threadIds: ["t1"] }),
    ).rejects.toThrow(/commit created \(newsha\).*failed to resolve.*t1: rate limited/);
  });

  it("skips the thread and does not commit when the file fetch fails", async () => {
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ id: "t1", path: "missing.ts" })]),
    });
    mockGetFileContents.mockRejectedValueOnce(new Error("404 not found"));

    const result = await runCommitSuggestions({
      ...GLOBAL_OPTS,
      prNumber: 42,
      threadIds: ["t1"],
    });

    expect(result.applied).toBe(false);
    expect(result.threads[0]).toMatchObject({
      status: "skipped",
      reason: expect.stringContaining("could not fetch file"),
    });
    expect(mockGraphql).not.toHaveBeenCalled();
  });
});
