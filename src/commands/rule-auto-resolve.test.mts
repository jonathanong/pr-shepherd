import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchPartition } from "../classify/apply.mts";
import type { BatchPrData, ReviewThread } from "../types.mts";
import { applySuppressedRuleAutoResolve } from "./rule-auto-resolve.mts";

vi.mock("../comments/resolve.mts", () => ({
  autoMinimizeComments: vi.fn(),
  autoResolveThreads: vi.fn(),
}));
import { autoMinimizeComments, autoResolveThreads } from "../comments/resolve.mts";

const mockMinimize = vi.mocked(autoMinimizeComments);
const mockResolve = vi.mocked(autoResolveThreads);
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
  viewerCanResolve: true,
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
  });

  it("returns the handoff ids without mutating when self-apply is off", async () => {
    const result = await applySuppressedRuleAutoResolve({
      enabled: false,
      partition: partition({ ruleAutoResolveThreadIds: ["t1"], ruleAutoResolveCommentIds: ["c1"] }),
      batch: batch(),
    });
    expect(result.threadIds).toEqual(["t1"]);
    expect(result.commentIds).toEqual(["c1"]);
    expect(result.autoResolved).toEqual([]);
    expect(result.autoMinimized).toEqual([]);
    expect(mockMinimize).not.toHaveBeenCalled();
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("reports confirmed ids and keeps failed ids on the handoff", async () => {
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
        reviewThreads: [thread],
        comments: [
          {
            id: "c-ok",
            url: "https://github.com/c/ok",
            viewerCanMinimize: true,
          } as BatchPrData["comments"][number],
          { id: "c-bad", viewerCanMinimize: true } as BatchPrData["comments"][number],
          { id: "c-other", viewerCanMinimize: true } as BatchPrData["comments"][number],
        ],
        reviewSummaries: [
          { id: "r1", viewerCanMinimize: true } as BatchPrData["reviewSummaries"][number],
        ],
      }),
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
    expect(result.errorReasons).toEqual(["noise", "other"]);
  });
});
