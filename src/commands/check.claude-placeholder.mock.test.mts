import { describe, it, expect, vi } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeComment,
  mockAutoMinimizeComments,
  mockFetchPrBatch,
  mockLoadSeenMap,
} from "../../test-helpers/commands/check.test-support.mts";
import { hashBody } from "../state/seen-comments.mts";
import { runCheck } from "./check.mts";

vi.mock("../classify/loader.mts", async () => {
  const { default: claudeNotices } = await import("../classify/standard/claude-notices.mts");
  const rules = [
    {
      name: "standard:claude-notices",
      file: "pr-shepherd:standard/claude-notices",
      rule: claudeNotices,
    },
  ];
  return {
    discoverRuleFiles: vi.fn().mockReturnValue(["fake-rule.mjs"]),
    loadRules: vi.fn().mockResolvedValue(rules),
    loadClassifyRules: vi.fn().mockResolvedValue(rules),
  };
});

registerHooks();

const id = "c-claude";
const placeholder =
  'Claude Code is working… <img src="https://github.com/user-attachments/assets/1" width="14px" />\n\nI\'ll analyze this and get back to you.\n\n[View job run](https://github.com/o/r/actions/runs/9)';
const review =
  "**Claude finished @jong's task** —— [View job](https://github.com/o/r/actions/runs/9)\n\nThe retry limit is off by one.";
const claudeComment = (body: string) =>
  makeComment({ id, author: "claude", authorType: "Bot" as const, body, isMinimized: false });

describe("runCheck — claude-notices placeholder", () => {
  it("suppresses the placeholder without queuing or performing a minimize", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ comments: [claudeComment(placeholder)] }),
    });

    const report = await runCheck({ ...BASE_OPTS, autoMinimizeSuppressed: true });

    expect(report.comments.actionable).toEqual([]);
    expect(report.comments.minimizeIds).toEqual([]);
    expect(report.comments.autoMinimized).toBeUndefined();
    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
  });

  it("surfaces the finished review as an edited comment and does not queue it for minimize", async () => {
    mockLoadSeenMap.mockResolvedValue(
      new Map([[id, { seenAt: 1000, bodyHash: hashBody(placeholder) }]]),
    );
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ comments: [claudeComment(review)] }),
    });

    const report = await runCheck({ ...BASE_OPTS, autoMinimizeSuppressed: true });

    expect(report.comments.edited).toEqual([
      expect.objectContaining({ id, body: review, edited: true }),
    ]);
    expect(report.comments.actionable).toEqual([]);
    expect(report.comments.minimizeIds).toEqual([]);
    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
  });
});
