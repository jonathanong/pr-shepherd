import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassifyItem } from "../classify/types.mts";

const { ruleItems } = vi.hoisted(() => ({ ruleItems: [] as ClassifyItem[] }));

vi.mock("../classify/loader.mts", () => ({
  loadClassifyRules: vi.fn().mockResolvedValue([
    {
      name: "bot-notice",
      file: "bot-notice.mjs",
      rule: (item: ClassifyItem) => {
        ruleItems.push(item);
        return item.body.includes("notice") ? { suppress: true, autoResolve: true } : null;
      },
    },
  ]),
}));
vi.mock("../config/load.mts", () => ({
  loadConfig: () => ({
    "bot-usernames": ["Helper-Bot[bot]"],
    standardRules: false,
    actions: { "auto-minimize-suppressed": true },
    iterate: {
      "minimize-comments": "bots",
      "minimize-approvals": false,
      "resolve-other-human-threads": "none",
    },
  }),
}));
vi.mock("../comments/resolve.mts", () => ({
  autoMinimizeComments: vi.fn(),
  autoResolveThreads: vi.fn(),
}));

import { evaluatePollSummaryReview } from "./poll-summary-review.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import { hashBody, type SeenMarker } from "../state/seen-comments.mts";
import { runWithGithubTransport } from "./transport.mts";
import { comment, raw, thread } from "../../test-helpers/github/poll-summary-review-raw.mts";

const key = { owner: "o", repo: "r", pr: 7 };

beforeEach(() => vi.stubEnv("CLAUDE_CODE_REMOTE", "false"));

const evaluate = (input: RawSummaryPr, seen = new Map<string, SeenMarker>()) =>
  runWithGithubTransport("graphql", () => evaluatePollSummaryReview(input, seen, true, key));

describe("compact first-look and long-thread handling", () => {
  it("treats a never-seen minimized comment as an acknowledgement, not readiness work", async () => {
    const { review } = await evaluate(
      raw({ comments: [comment("c1", "anything", { isMinimized: true })] }),
    );
    expect(review).toEqual({ comments: 1 });
  });

  it("does not re-surface a long resolved thread once seen, but does when never seen", async () => {
    const long = (): Record<string, unknown> => {
      const base = thread("t-long", "ordinary finding", { isResolved: true });
      (base.comments as { pageInfo: { hasPreviousPage: boolean } }).pageInfo = {
        hasPreviousPage: true,
      };
      return base;
    };
    const seen = new Map<string, SeenMarker>([
      ["t-long", { seenAt: 1, bodyHash: "full-transcript" }],
    ]);
    const marked = await evaluate(raw({ threads: [long()] }), seen);
    expect(marked.review).toEqual({ threads: 1, incomplete: true });
    expect((await evaluate(raw({ threads: [long()] }))).review.actionable).toBe(1);
  });

  it("keeps a long unresolved thread actionable even when a marker exists", async () => {
    const base = thread("t-long", "ordinary finding", { isResolved: false });
    (base.comments as { pageInfo: { hasPreviousPage: boolean } }).pageInfo = {
      hasPreviousPage: true,
    };
    const seen = new Map<string, SeenMarker>([
      ["t-long", { seenAt: 1, bodyHash: "full-transcript" }],
    ]);
    expect((await evaluate(raw({ threads: [base] }), seen)).review.actionable).toBe(1);
  });

  it("normalizes configured bot names and the [bot] suffix for changes-requested and threads", async () => {
    const helper = { login: " Helper-Bot[bot] ", __typename: "User" };
    const changes = {
      id: "cr1",
      state: "CHANGES_REQUESTED",
      body: "please change",
      author: helper,
      isMinimized: false,
    };
    const seenCr = new Map<string, SeenMarker>([
      ["cr1", { seenAt: 1, bodyHash: hashBody("please change") }],
    ]);
    // A bot review stays actionable after it was seen: only a dismissal clears it.
    expect((await evaluate(raw({ reviews: [changes] }), seenCr)).review.actionable).toBe(1);
    const human = { ...changes, author: { login: "alice", __typename: "User" } };
    // A human changes-requested review counts whether or not it was seen, like the full check.
    expect((await evaluate(raw({ reviews: [human] }), seenCr)).review.actionable).toBe(1);
    const botThread = thread("tb", "ordinary", { isResolved: false });
    (botThread.comments as { nodes: Array<{ author: unknown }> }).nodes[0]!.author = helper;
    const seenThread = new Map<string, SeenMarker>([
      ["tb", { seenAt: 1, bodyHash: hashBody("ordinary") }],
    ]);
    expect((await evaluate(raw({ threads: [botThread] }), seenThread)).review.actionable).toBe(1);
  });
});

describe("changes-requested rule items", () => {
  it("omits the URL like the full check", async () => {
    const input = raw({
      reviews: [
        {
          id: "cr",
          state: "CHANGES_REQUESTED",
          body: "please change",
          url: "https://example.test/cr",
          author: { login: "human", __typename: "User" },
        },
      ],
    });
    await evaluate(input);
    expect(ruleItems.at(-1)).toEqual({
      kind: "changes-requested",
      id: "cr",
      author: "human",
      authorType: "User",
      body: "please change",
    });
  });

  it("does not route a suppressed changes-requested review", async () => {
    const { review } = await evaluate(
      raw({
        reviews: [
          {
            id: "cr2",
            state: "CHANGES_REQUESTED",
            body: "notice only",
            url: "https://example.test/cr2",
            author: { login: "human", __typename: "User" },
          },
        ],
      }),
    );
    expect(review.actionable).toBeUndefined();
  });
});
