import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassifyItem } from "../classify/types.mts";

const hoisted = vi.hoisted(() => ({
  enabled: { value: true },
  minimize: vi.fn(),
  resolve: vi.fn(),
  markSeen: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../classify/loader.mts", () => ({
  loadClassifyRules: vi.fn().mockResolvedValue([
    {
      name: "bot-notice",
      file: "bot-notice.mjs",
      rule: (item: ClassifyItem) =>
        item.body.includes("notice")
          ? { suppress: true, autoResolve: true, reason: "bot notice" }
          : null,
    },
  ]),
}));
vi.mock("../config/load.mts", () => ({
  loadConfig: () => ({
    "bot-usernames": ["Helper-Bot[bot]"],
    standardRules: false,
    actions: { "auto-minimize-suppressed": hoisted.enabled.value },
  }),
}));
vi.mock("../comments/resolve.mts", () => ({
  autoMinimizeComments: hoisted.minimize,
  autoResolveThreads: hoisted.resolve,
}));
vi.mock("../state/seen-comments.mts", async (importActual) => ({
  ...(await importActual<typeof import("../state/seen-comments.mts")>()),
  markSeen: hoisted.markSeen,
}));

import { evaluatePollSummaryReview } from "./poll-summary-review.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import { raw, comment, thread } from "../../test-helpers/github/poll-summary-review-raw.mts";
import type { SeenMarker } from "../state/seen-comments.mts";
import { runWithGithubTransport } from "./transport.mts";

const key = { owner: "o", repo: "r", pr: 7 };

beforeEach(() => {
  hoisted.enabled.value = true;
  hoisted.minimize.mockReset();
  hoisted.resolve.mockReset();
  hoisted.markSeen.mockClear();
  hoisted.minimize.mockImplementation(async (ids: string[]) => ({ minimized: ids, errors: [] }));
  hoisted.resolve.mockImplementation(async (ids: string[]) => ({ resolved: ids, errors: [] }));
  vi.stubEnv("CLAUDE_CODE_REMOTE", "false");
});
afterEach(() => vi.unstubAllEnvs());

const evaluate = (input: RawSummaryPr, seen = new Map<string, SeenMarker>()) =>
  runWithGithubTransport("graphql", () => evaluatePollSummaryReview(input, seen, true, key));

describe("compact rule-driven auto-resolve", () => {
  it("minimizes a matching comment and review summary, marks them seen, and does not route them", async () => {
    const input = raw({
      comments: [comment("c1", "progress notice")],
      reviews: [comment("r1", "review notice", { state: "COMMENTED" })],
    });
    const { review, ruleAutoResolve } = await evaluate(input);
    expect(review).toEqual({ comments: 1, reviews: 1 });
    expect(hoisted.minimize).toHaveBeenCalledWith(["c1", "r1"]);
    expect(hoisted.markSeen).toHaveBeenCalledWith(key, "c1", "progress notice");
    expect(hoisted.markSeen).toHaveBeenCalledWith(key, "r1", "review notice");
    expect(ruleAutoResolve).toEqual({
      summary: "minimized 1 comment and 1 review summary (rule: bot notice)",
      minimized: [
        { id: "c1", kind: "pr-comment", url: "https://example.test/c1", ruleReason: "bot notice" },
        {
          id: "r1",
          kind: "review-summary",
          url: "https://example.test/r1",
          ruleReason: "bot notice",
        },
      ],
    });
    // The read reflects GitHub so a stack handoff does not replay the mutation.
    expect(input.comments.nodes[0]!.isMinimized).toBe(true);
    expect(input.reviews.nodes[0]!.isMinimized).toBe(true);
  });

  it("resolves a matching unresolved thread and counts it as handled", async () => {
    const input = raw({ threads: [thread("t1", "notice")] });
    const { review, ruleAutoResolve } = await evaluate(input);
    expect(review).toEqual({ threads: 1 });
    expect(hoisted.resolve).toHaveBeenCalledWith(["t1"]);
    expect(hoisted.markSeen).toHaveBeenCalledWith(key, "t1", "notice");
    expect(ruleAutoResolve?.summary).toBe("auto-resolved 1 thread (rule: bot notice)");
    expect(ruleAutoResolve?.threads).toEqual([{ id: "t1", url: "https://example.test/t1" }]);
    expect(input.reviewThreads.nodes[0]!.isResolved).toBe(true);
  });

  it("does not mark a long thread seen from its truncated window", async () => {
    const long = thread("t-long", "notice");
    (long.comments as { pageInfo: { hasPreviousPage: boolean } }).pageInfo = {
      hasPreviousPage: true,
    };
    const { review } = await evaluate(raw({ threads: [long] }));
    expect(review.actionable).toBeUndefined();
    expect(hoisted.resolve).toHaveBeenCalledWith(["t-long"]);
    expect(hoisted.markSeen).not.toHaveBeenCalled();
  });

  it("keeps an unconfirmed mutation actionable and surfaces its error", async () => {
    hoisted.minimize.mockResolvedValue({ minimized: [], errors: ["c1: boom"] });
    hoisted.resolve.mockResolvedValue({ resolved: [], errors: ["t1: nope"] });
    const { review, ruleAutoResolve } = await evaluate(
      raw({
        comments: [comment("c1", "notice")],
        reviews: [comment("r1", "notice", { state: "COMMENTED" })],
        threads: [thread("t1", "notice")],
      }),
    );
    expect(review.actionable).toBe(3);
    expect(ruleAutoResolve).toEqual({
      summary: "auto-resolve failed for 2 mutations (rule: bot notice)",
      errors: ["c1: boom (rule: bot notice)", "t1: nope (rule: bot notice)"],
    });
  });

  it("attempts an unknown-capability thread resolve on the CCR REST route but never a minimize", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    const input = raw({
      comments: [comment("c1", "notice", { viewerCanMinimize: undefined })],
      threads: [thread("t1", "notice", { viewerCanResolve: undefined })],
    });
    const { review } = await runWithGithubTransport("rest", () =>
      evaluatePollSummaryReview(input, new Map(), true, key),
    );
    expect(hoisted.resolve).toHaveBeenCalledWith(["t1"]);
    expect(hoisted.minimize).not.toHaveBeenCalled();
    expect(review.actionable).toBe(1);
  });

  it("treats a resolved or outdated match as handled without mutating", async () => {
    const { review } = await evaluate(
      raw({
        threads: [
          thread("t-resolved", "notice", { isResolved: true }),
          thread("t-outdated", "notice", { isOutdated: true }),
        ],
      }),
    );
    expect(review.actionable).toBeUndefined();
    expect(hoisted.resolve).not.toHaveBeenCalled();
  });
});
