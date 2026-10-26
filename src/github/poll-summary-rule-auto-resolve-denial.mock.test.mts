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
    iterate: {
      "minimize-comments": "bots",
      "minimize-approvals": false,
      "resolve-other-human-threads": "none",
    },
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
import { page, raw, comment, thread } from "../../test-helpers/github/poll-summary-review-raw.mts";
import { hashBody, type SeenMarker } from "../state/seen-comments.mts";
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

describe("compact auto-resolve denial and gating", () => {
  it("surfaces a denied item once through the normal first-look gate, then skips it", async () => {
    const denied = (): RawSummaryPr =>
      raw({
        comments: [comment("c1", "notice", { viewerCanMinimize: false })],
        threads: [
          thread("t1", "notice", {
            viewerCanResolve: false,
            comments: {
              totalCount: 1,
              pageInfo: page,
              nodes: [
                { id: "t1-root", body: "notice", author: { login: "alice", __typename: "User" } },
              ],
            },
          }),
        ],
      });
    const first = await evaluate(denied());
    expect(first.review.actionable).toBe(2);
    expect(first.ruleAutoResolve).toBeUndefined();
    expect(hoisted.minimize).not.toHaveBeenCalled();
    expect(hoisted.resolve).not.toHaveBeenCalled();
    expect(hoisted.markSeen).not.toHaveBeenCalled();
    const seen = new Map<string, SeenMarker>([
      ["c1", { seenAt: 1, bodyHash: hashBody("notice") }],
      ["t1", { seenAt: 1, bodyHash: hashBody("notice") }],
    ]);
    expect((await evaluate(denied(), seen)).review.actionable).toBeUndefined();
  });

  it("skips an item whose earlier mutation GitHub denied for the same body", async () => {
    const seen = new Map<string, SeenMarker>([
      [
        "c1",
        { seenAt: 1, bodyHash: hashBody("notice"), deniedMutationBodyHash: hashBody("notice") },
      ],
      ["t1", { seenAt: 1, deniedMutationBodyHash: hashBody("notice") }],
    ]);
    const long = thread("t1", "notice");
    (long.comments as { pageInfo: { hasPreviousPage: boolean } }).pageInfo = {
      hasPreviousPage: true,
    };
    await evaluate(raw({ comments: [comment("c1", "notice")], threads: [long] }), seen);
    expect(hoisted.minimize).not.toHaveBeenCalled();
    expect(hoisted.resolve).not.toHaveBeenCalled();
    // A short thread honors the denial only for the body GitHub denied.
    const shortSeen = new Map<string, SeenMarker>([
      ["t1", { seenAt: 1, deniedMutationBodyHash: hashBody("notice") }],
    ]);
    await evaluate(raw({ threads: [thread("t1", "notice")] }), shortSeen);
    expect(hoisted.resolve).not.toHaveBeenCalled();
    await evaluate(raw({ threads: [thread("t1", "notice, edited")] }), shortSeen);
    expect(hoisted.resolve).toHaveBeenCalledTimes(1);
  });

  it("stays read-only without a target or when actions.auto-minimize-suppressed is off", async () => {
    const input = (): RawSummaryPr => raw({ comments: [comment("c1", "notice")] });
    expect(
      (
        await runWithGithubTransport("graphql", () =>
          evaluatePollSummaryReview(input(), new Map(), true),
        )
      ).review.actionable,
    ).toBe(1);
    hoisted.enabled.value = false;
    expect((await evaluate(input())).review.actionable).toBe(1);
    expect(hoisted.minimize).not.toHaveBeenCalled();
    expect(hoisted.markSeen).not.toHaveBeenCalled();
  });
});
