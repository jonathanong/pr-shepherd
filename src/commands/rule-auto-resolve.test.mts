import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchPartition } from "../classify/apply.mts";
import type { BatchPrData, ReviewThread } from "../types.mts";
import { applySuppressedRuleAutoResolve } from "./rule-auto-resolve.mts";

vi.mock("../comments/resolve.mts", () => ({
  autoMinimizeComments: vi.fn(),
  autoResolveThreads: vi.fn(),
}));
vi.mock("./journal/index.mts", () => ({ runJournal: vi.fn() }));

import { autoMinimizeComments, autoResolveThreads } from "../comments/resolve.mts";
import { runJournal } from "./journal/index.mts";

const mockMinimize = vi.mocked(autoMinimizeComments);
const mockResolve = vi.mocked(autoResolveThreads);
const mockJournal = vi.mocked(runJournal);
const repo = { owner: "owner", name: "repo" };
const thread = {
  id: "t1",
  url: "https://github.com/o/r/pull/1#discussion_r1",
  isResolved: false,
  isOutdated: false,
  isMinimized: false,
  path: "a.ts",
  line: 1,
  startLine: null,
  author: "bot",
  authorType: "Bot",
  body: "noise",
} as ReviewThread;

function partition(overrides: Partial<BatchPartition> = {}): BatchPartition {
  return {
    suppressedCommentIds: new Set(),
    suppressedThreadIds: new Set(),
    suppressedReviewSummaryIds: new Set(),
    suppressedChangesRequestedIds: new Set(),
    ruleAutoResolveCommentIds: [],
    ruleAutoResolveThreadIds: [],
    ruleAutoResolveReviewSummaryIds: [],
    ruleReasons: new Map(),
    ...overrides,
  };
}

function batch(overrides: Partial<BatchPrData> = {}): BatchPrData {
  return { reviewThreads: [], comments: [], reviewSummaries: [], ...overrides } as BatchPrData;
}

describe("applySuppressedRuleAutoResolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMinimize.mockResolvedValue({ minimized: [], errors: [] });
    mockResolve.mockResolvedValue({ resolved: [], errors: [] });
    mockJournal.mockResolvedValue({
      prNumber: 7,
      mutated: true,
      sectionExisted: false,
      dryRun: false,
    });
  });

  it("returns the handoff ids without mutating when self-apply is off", async () => {
    const result = await applySuppressedRuleAutoResolve({
      enabled: false,
      partition: partition({ ruleAutoResolveThreadIds: ["t1"], ruleAutoResolveCommentIds: ["c1"] }),
      batch: batch(),
      prNumber: 7,
      repo,
    });
    expect(result.threadIds).toEqual(["t1"]);
    expect(result.commentIds).toEqual(["c1"]);
    expect(result.autoResolved).toEqual([]);
    expect(result.autoMinimized).toEqual([]);
    expect(mockMinimize).not.toHaveBeenCalled();
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockJournal).not.toHaveBeenCalled();
  });

  it("journals confirmed ids and keeps failed ids on the handoff", async () => {
    mockMinimize.mockResolvedValue({
      minimized: ["c-ok"],
      errors: ["c-bad: no", "rate limit: slow", "network"],
    });
    mockResolve.mockResolvedValue({
      resolved: ["t1", "t-missing"],
      errors: ["t-plain: failed"],
    });
    const result = await applySuppressedRuleAutoResolve({
      enabled: true,
      partition: partition({
        suppressedCommentIds: new Set(["c-ok", "c-bad", "c-other"]),
        suppressedThreadIds: new Set(["t1", "t-missing", "t-plain"]),
        suppressedReviewSummaryIds: new Set(["r1"]),
        ruleAutoResolveCommentIds: ["c-visible", "c-ok", "c-bad", "c-other"],
        ruleAutoResolveThreadIds: ["t1", "t-missing", "t-plain"],
        ruleAutoResolveReviewSummaryIds: ["r1"],
        ruleReasons: new Map([
          ["c-ok", ["noise"]],
          ["c-bad", ["noise"]],
          ["c-other", ["other"]],
          ["t1", ["noise"]],
        ]),
      }),
      batch: batch({
        viewerLogin: "alice",
        reviewThreads: [thread],
        comments: [
          { id: "c-ok", url: "https://github.com/c/ok" } as BatchPrData["comments"][number],
        ],
        reviewSummaries: [{ id: "r1" } as BatchPrData["reviewSummaries"][number]],
      }),
      prNumber: 7,
      repo,
    });
    expect(mockMinimize).toHaveBeenCalledWith(["c-ok", "c-bad", "c-other", "r1"]);
    expect(result.autoResolved.map((item) => item.id)).toEqual(["t1"]);
    expect(result.autoResolved[0]?.isResolved).toBe(true);
    expect(result.autoMinimized).toEqual([
      { id: "c-ok", kind: "pr-comment", url: "https://github.com/c/ok", ruleReason: "noise" },
    ]);
    expect(result.commentIds).toEqual(["c-visible", "c-bad", "c-other"]);
    expect(result.reviewSummaryIds).toEqual(["r1"]);
    expect(result.threadIds).toEqual(["t-plain"]);
    expect(result.autoResolveErrors).toEqual([
      "c-bad: no (rule: noise)",
      "rate limit: slow (rules: noise; other)",
      "network",
      "t-plain: failed",
    ]);
    expect(mockJournal).toHaveBeenCalledWith(
      expect.objectContaining({
        prNumber: 7,
        dryRun: false,
        rawItem:
          "- auto-resolved 1 thread, minimized 1 comment as @alice (rule: noise): https://github.com/o/r/pull/1#discussion_r1, https://github.com/c/ok",
      }),
    );
  });

  it("reports a journal failure without dropping confirmed resolutions", async () => {
    mockResolve.mockResolvedValue({ resolved: ["t1"], errors: [] });
    mockJournal.mockRejectedValueOnce(new Error("write failed"));
    const failed = await applySuppressedRuleAutoResolve({
      enabled: true,
      partition: partition({
        suppressedThreadIds: new Set(["t1"]),
        ruleAutoResolveThreadIds: ["t1"],
        ruleReasons: new Map([["t1", ["noise"]]]),
      }),
      batch: batch({ reviewThreads: [thread], viewerLogin: "alice" }),
      prNumber: 7,
      repo,
    });
    expect(failed.autoResolved).toHaveLength(1);
    expect(failed.autoResolveErrors).toEqual(["journal: write failed (rule: noise)"]);

    mockResolve.mockResolvedValue({ resolved: ["t1"], errors: [] });
    mockJournal.mockRejectedValueOnce("disk");
    const untyped = await applySuppressedRuleAutoResolve({
      enabled: true,
      partition: partition({
        suppressedThreadIds: new Set(["t1"]),
        ruleAutoResolveThreadIds: ["t1"],
      }),
      batch: batch({ reviewThreads: [thread] }),
      prNumber: 7,
      repo,
    });
    expect(untyped.autoResolveErrors).toEqual(["journal: disk"]);
    expect(mockJournal.mock.calls[1]?.[0].rawItem).toContain("(token login unavailable)");
  });
});
