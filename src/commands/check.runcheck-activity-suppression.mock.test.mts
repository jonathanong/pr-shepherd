import { describe, it, expect, vi } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeComment,
  mockFetchPrBatch,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";
import type { ClassifyItem } from "../classify/types.mts";

vi.mock("../classify/loader.mts", () => {
  const rules = [
    {
      name: "test-rule",
      file: "fake-rule.mjs",
      rule: (item: ClassifyItem) =>
        item.author === "bot-reviewer" ? { suppress: true, autoResolve: true } : null,
    },
  ];
  return {
    discoverRuleFiles: vi.fn().mockReturnValue(["fake-rule.mjs"]),
    loadRules: vi.fn().mockResolvedValue(rules),
    loadClassifyRules: vi.fn().mockResolvedValue(rules),
  };
});

registerHooks();

describe("runCheck — activity excludes rule-suppressed items", () => {
  it("drops suppressed comments from the activity items and keeps real ones", async () => {
    const activityItem = (id: string, author: string) => ({
      kind: "pr-comment" as const,
      id,
      author,
      authorType: author === "bot-reviewer" ? ("Bot" as const) : ("User" as const),
      body: `${id} body`,
      createdAtUnix: 10,
    });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        comments: [
          makeComment({ id: "c-bot", author: "bot-reviewer", authorType: "Bot" as const }),
          makeComment({ id: "c-human", author: "human", authorType: "User" as const }),
        ],
        activity: {
          commitCount: 1,
          reviewRoundCount: 3,
          latestCommitCommittedAtUnix: 1,
          reviewItemsSinceLatestCommit: [
            activityItem("c-bot", "bot-reviewer"),
            activityItem("c-human", "human"),
          ],
        },
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.activity?.reviewItemsSinceLatestCommit.map((i) => i.id)).toEqual(["c-human"]);
    expect(report.activity?.reviewRoundCount).toBe(3);
  });
});
